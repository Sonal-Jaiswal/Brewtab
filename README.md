# Brewtab — Start every tab fresh

Brewtab replaces Chrome's new tab page with a calm, customisable dashboard and adds three optional tools:

| Module | What it does |
| --- | --- |
| **Brewtab** (dashboard) | Clock & greeting, search, shortcuts with folders, and widgets for tasks, notes, focus, screen time, bookmarks, modules and a daily quote. Four themes plus custom wallpapers. |
| **ScrollStop** | Blocks sites always, on schedules or during focus sessions; URL patterns and an allowlist; daily time limits; screen-time reports. |
| **NightShift** | Dark mode, brightness, contrast, warmth, text size and typeface for any site; per-site settings, exclusions, a schedule and reading mode. |
| **SnapPage** | Visible-area, region and full-page screenshots; crop, resize, blur, arrows, shapes, text and highlights; PNG/JPEG export and copy to clipboard. |

Everything runs locally. There is no backend, account, analytics or AI service, and no remotely loaded code.

## Requirements

- Node.js 20+ (developed with Node 24.2) and npm 10+
- Google Chrome 116 or newer

## Quick start

```bash
npm install
npm run build          # typecheck + production build → dist/
```

Load the unpacked extension:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `dist/` folder.
3. Open a new tab. The first-run setup appears (you can skip it).

During development, `npm run dev` rebuilds on change; click the reload icon on `chrome://extensions` afterwards.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Typecheck and build the release extension into `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit and integration tests (Vitest, jsdom, fake IndexedDB) |
| `npm run test:e2e` | Builds `dist-e2e/` and runs Playwright end-to-end tests against the real extension in Chromium |
| `npm run package` | Builds, checks (MV3, no host permissions, no test hooks, no eval or remote code) and writes `release/brewtab-<version>.zip` |
| `npm run assets` | Regenerates icons and store promo tiles |
| `npm run screenshots` | Captures screenshots of every surface into `store/screenshots/` (run `npm run build` and `npm run build:e2e` first) |

First-time E2E setup: `npx playwright install chromium`.

## Project structure

```text
manifest      scripts/manifest.mjs (generated into dist/manifest.json)
src/
  background/   service worker: blocking sync, alarms, focus, usage tracking,
                NightShift registration, SnapPage capture, context menus
  content/      content scripts (IIFE): nightshift, reader, region, fullpage
  dashboard/    new tab page: components, widgets (registry), layout, logic
  modules/      pure logic: scrollstop (rules, schedule, focus, usage), nightshift (engine)
  snappage/     screenshot library and editor (state, render, UI)
  popup/        toolbar popup
  settings/     settings page and sections
  blocked/      ScrollStop blocked page
  storage/      chrome.storage settings + IndexedDB (migrations, repos, backup)
  shared/       design system components, hooks, types, utils, permissions, messages
  styles/       Tailwind v4 + theme tokens
tests/unit      Vitest
tests/e2e       Playwright (fixture server on :4599)
docs/           user guide, privacy policy, permissions, store listing, limitations, testing report
store/          screenshots, 1280×800 Web Store images, promo tiles
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy policy](docs/PRIVACY_POLICY.md)
- [Permission justifications](docs/PERMISSIONS.md)
- [Chrome Web Store listing & publishing checklist](docs/STORE_LISTING.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Testing report](docs/TESTING_REPORT.md)

## Project history

Development started on 31 October 2026. The git history reflects the actual order in which the work was done and committed.
