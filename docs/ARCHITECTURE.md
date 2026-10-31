# Architecture

## Build

Vite builds in three passes (`scripts/build.mjs`):

1. **Extension pages** (`newtab`, `popup`, `settings`, `snappage`, `blocked`): React 19 with code splitting. Widgets, settings sections and onboarding are lazy-loaded. The SnapPage editor is a separate page, so it never loads with the new tab.
2. **Service worker**: a single ES module. Service workers can't use dynamic `import()`, so it's built with `inlineDynamicImports`.
3. **Content scripts**: one self-contained IIFE per script (`nightshift`, `reader`, `region`, `fullpage`), because content scripts can't be ES modules.

`scripts/manifest.mjs` generates the manifest. `--e2e` builds `dist-e2e/` with extra host permissions for the local test server, plus `<all_urls>` to stand in for the `activeTab` grant that a real click provides. It also sets `__BREWTAB_E2E__ = true`, which exposes test hooks in the service worker. The release build replaces the flag with `false` and the minifier removes the hooks. `npm run package` verifies this.

## Separation of concerns

| Layer | Location | Notes |
| --- | --- | --- |
| Pure business logic | `src/modules/**`, `src/dashboard/{layout,quicklinks,task-views,format}.ts`, `src/snappage/state.ts` | No Chrome APIs; unit-tested directly |
| Storage | `src/storage/**` | The only code that touches `chrome.storage` and IndexedDB |
| Chrome integration | `src/background/**`, `src/shared/permissions.ts`, `src/shared/messages.ts` | |
| UI | `src/dashboard`, `src/settings`, `src/popup`, `src/snappage`, `src/blocked`, `src/shared/components` | |
| Page integration | `src/content/**` | Injected only when needed |

## Storage

- **`chrome.storage.local`**
  - `settings`: a single versioned object. Every read goes through `migrateSettings()`, which deep-merges onto defaults and sanitises values, so new fields appear after updates and corrupt values can't break pages.
  - `focusState` and `limitState`: runtime state, kept separate so they don't re-render every page.
- **`chrome.storage.session`**: the active usage-tracking segment. It survives service-worker suspension but not a browser restart.
- **IndexedDB `brewtab`**: tasks, notes, usage (per day and domain), focus sessions, dashboard documents (layout and shortcuts), captures (screenshot blobs), wallpapers, and backups (automatic safety copies). Schema changes go through ordered migrations in `db.ts`. Never edit an existing migration; add a new one.
- **Cross-tab updates**: settings use `chrome.storage.onChanged`. IndexedDB changes are announced on a `BroadcastChannel`.

## Service worker lifecycle

The worker holds no state in memory that matters. On every start it runs `bootstrap()`, which:

- ensures the recurring alarms exist;
- catches up focus phases that ended while it was suspended or Chrome was closed;
- resets daily limits after midnight;
- rebuilds the DNR rules, NightShift registration and context menus.

Changes to settings, focus state, limits or permissions trigger the relevant sync. Each sync is serialised to avoid races; a real race in NightShift registration was found by the E2E tests and fixed.

Alarms:

| Alarm | When |
| --- | --- |
| `focus-phase` | At the end of each focus or break phase |
| `schedule-boundary` | At the next schedule start or end (computed, not polled) |
| `tick` | Every minute: credits usage time and updates the badge |
| `daily-reset` | At local midnight |

## ScrollStop blocking

`buildRules()` (pure) turns settings and current context into `declarativeNetRequest` dynamic rules:

- Domain rules use `requestDomains`, which covers subdomains.
- Patterns become RE2 regexes.
- Allowlist entries are `allow` rules at higher priority.
- With site access, blocks are `redirect`s to `blocked.html?reason=…#<original URL>`. Without it, they're plain `block`s, because DNR redirects need host permission.
- Tabs that are already open and become blocked are redirected too.

## NightShift

`buildCss()` produces scoped CSS. Dark mode applies `invert + hue-rotate` to the root and re-inverts media, so content added later (SPAs, infinite scroll) is covered automatically without per-node work.

The content script:

- re-attaches its `<style>` if a framework removes it;
- reacts live to settings changes;
- times schedule boundaries;
- skips inversion on pages that are already dark.

It's registered dynamically only in automatic mode with site access. Otherwise it's injected on demand through `activeTab`.

## SnapPage

Capture uses `chrome.tabs.captureVisibleTab`, throttled to Chrome's limit of two calls per second.

- **Region capture:** injects a temporary overlay, removes it, then captures and records the crop.
- **Full-page capture:** scrolls the page, hides fixed and sticky elements after the first frame, and stitches frames on an `OffscreenCanvas` in the worker, within safe canvas limits.

The editor keeps annotations as vector shapes over the original image. Crop and resize are document properties, which makes undo and redo cheap. Export renders on an `OffscreenCanvas` and encodes asynchronously.

## Widgets

`src/dashboard/widgets/registry.ts` maps widget types to a lazy component, icon, description, an optional module dependency and declarative settings fields. Adding a widget means writing a component that takes `WidgetProps` and adding one registry entry. Layout persistence, drag-and-drop (dnd-kit, with keyboard support), resizing and the settings dialog all work automatically.
