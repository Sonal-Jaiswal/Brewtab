# Architecture

## Build

Vite builds in two passes (`scripts/build.mjs`):

1. **Extension pages** (`newtab`, `popup`, `settings`, `blocked`): React 19 with code splitting. Widgets, settings sections and onboarding are lazy-loaded.
2. **Service worker**: a single ES module. Service workers can't use dynamic `import()`, so it's built with `inlineDynamicImports`.

Brewtab has no content scripts: it never runs code inside web pages.

`scripts/manifest.mjs` generates the manifest. `--e2e` builds `dist-e2e/` with host permissions for the local test server. It also sets `__BREWTAB_E2E__ = true`, which exposes test hooks in the service worker. The release build replaces the flag with `false` and the minifier removes the hooks. `npm run package` verifies this.

## Separation of concerns

| Layer | Location | Notes |
| --- | --- | --- |
| Pure business logic | `src/modules/**`, `src/dashboard/{layout,quicklinks,task-views,format}.ts` | No Chrome APIs; unit-tested directly |
| Storage | `src/storage/**` | The only code that touches `chrome.storage` and IndexedDB |
| Chrome integration | `src/background/**`, `src/shared/permissions.ts`, `src/shared/messages.ts` | |
| UI | `src/dashboard`, `src/settings`, `src/popup`, `src/blocked`, `src/shared/components` | |

## Storage

- **`chrome.storage.local`**
  - `settings`: a single versioned object. Every read goes through `migrateSettings()`, which deep-merges onto defaults and sanitises values, so new fields appear after updates and corrupt values can't break pages.
  - `focusState` and `limitState`: runtime state, kept separate so they don't re-render every page.
- **`chrome.storage.session`**: the active usage-tracking segment. It survives service-worker suspension but not a browser restart.
- **IndexedDB `brewtab`**: tasks, notes, usage (per day and domain), focus sessions, dashboard documents (layout and shortcuts), wallpapers, and backups (automatic safety copies). Schema changes go through ordered migrations in `db.ts`. Never edit an existing migration; add a new one.
- **Cross-tab updates**: settings use `chrome.storage.onChanged`. IndexedDB changes are announced on a `BroadcastChannel`.

## Service worker lifecycle

The worker holds no state in memory that matters. On every start it runs `bootstrap()`, which:

- ensures the recurring alarms exist;
- catches up focus phases that ended while it was suspended or Chrome was closed;
- resets daily limits after midnight;
- rebuilds the DNR rules and the context menu.

Changes to settings, focus state, limits or permissions trigger the relevant sync. Each sync is serialised to avoid races.

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
- `blocked.html` is listed in `web_accessible_resources`. Without that, Chrome allows the redirect only for navigations the browser starts (a typed address). For a link click it shows its own error page instead.
- Tabs that are already open and become blocked are redirected too.
- The list of sites over their daily limit is recomputed from today's usage after every tracked minute and every settings change, so changing a limit takes effect at once.
- Turning ScrollStop off ends a running focus session.

## Widgets

`src/dashboard/widgets/registry.ts` maps widget types to a lazy component, icon, description, an optional module dependency and declarative settings fields. Adding a widget means writing a component that takes `WidgetProps` and adding one registry entry. Layout persistence, drag-and-drop (dnd-kit, with keyboard support), resizing and the settings dialog all work automatically.
