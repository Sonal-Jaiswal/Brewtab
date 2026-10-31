# Testing report — Brewtab 1.0.0

*Final run: 31 October 2026 · macOS (Darwin 27.2) · Node 24.2 · Playwright 1.64.1 with its bundled Chromium (headless)*

## Results

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npm run typecheck` | ✅ 0 errors |
| Unit & integration | `npm test` | ✅ **79 / 79 passed** (6 files) |
| End-to-end (real extension in Chromium) | `npm run test:e2e` | ✅ **35 passed, 1 skipped, 0 failed** |
| Dependency audit | `npm audit` | ✅ 0 vulnerabilities |
| Release package checks | `npm run package` | ✅ MV3; no host permissions; no test hooks; no eval or remote code; 86 files, 532 KB ZIP |

Flakiness check: the dashboard E2E suite was also run twice back to back (`--repeat-each=2`), and the widget-reorder test three times. All passed.

## What the end-to-end tests cover

Each test launches Chromium with a **fresh profile** and the unpacked E2E build, and drives the real UI.

**Dashboard**

- Fresh install opens onboarding. Completing it persists name, theme, search engine, modules and starter shortcuts across reloads. Onboarding can also be skipped.
- Tasks: create, edit (title, priority, category), complete, view in Done, delete, persistence across reloads, and the overdue view.
- Notes: create with autosave, pin, search, persistence, and Markdown export (file download).
- Widgets: remove, add from the registry, keyboard drag-and-drop reorder, resize, persistence across reloads, and reset to default. Widgets that depend on a module hide when it's off.
- Themes: switching persists across reloads and other tabs. Appearance settings (radius, widget opacity, text colour, background colour) apply. Wallpaper upload works end to end.
- Shortcuts: add, duplicate warning, edit through the context menu, delete, and folders.
- Search:
  - Chrome default engine through `chrome.search`;
  - a chosen provider (DuckDuckGo) builds the correct URL;
  - a typed address opens directly;
  - the `/` shortcut focuses the search box.
- Robustness:
  - corrupt stored settings fall back to defaults;
  - the dashboard works fully **offline**;
  - no horizontal overflow at 700, 1024, 1280 and 1920 px;
  - no console errors on any extension page.

**ScrollStop**

- A block rule added in Settings, with "always block" on, redirects a real navigation to the blocked page. Removing the rule unblocks it.
- URL-pattern rules and allowlist precedence.
- A focus session started from the popup blocks sites (the blocked page shows the countdown), pauses, resumes and ends, writing a history record.
- Alarm-driven phase completion, including catch-up after missed wake-ups.
- A schedule active now creates rules and a boundary alarm; one outside the window creates none.
- Disabling the module removes all rules.

**NightShift**

- Automatic mode applies dark mode and re-inverts images.
- The style is re-attached after a framework removes it.
- Late-loaded content is covered.
- Per-site disable and per-site preferences update live without reload, and exclusions win.
- Already-dark pages aren't inverted, but brightness still applies.
- Turning the module off removes styles and unregisters the content script.
- Reading mode opens and closes with Esc and doesn't touch the site's `localStorage`.

**SnapPage**

- Visible capture opens the editor.
- Full-page capture stitches a long page (output much taller than the viewport) and restores the scroll position.
- Editor:
  - rectangle, arrow, blur and text annotations;
  - undo back to the original pixels, then redo;
  - crop and resize to an exact output size;
  - PNG download, with dimensions verified from the PNG header, and JPEG download;
  - library listing and delete.

**Popup and lifecycle**

- Popup module toggles update settings.
- **Browser restart:** tasks, an in-progress focus session, its alarm and its DNR rules all survive closing and relaunching the same profile, and onboarding doesn't reappear.
- Backup download, erase-all (back to fresh-install state) and merge import restore the data.
- All 11 settings sections render.

## Unit and integration tests (79)

- `storage.test.ts`:
  - settings defaults, partial updates, serialised concurrent updates, migration of old or partial data, corrupt-data recovery;
  - task, note, usage and capture repositories (including retention pruning), persistence across DB reconnects;
  - backup round-trip, invalid-file rejection, dropping invalid records;
  - merge keeps newer local items, replace snapshot plus restore (undo);
  - shortcut merge without duplicates.
- `scrollstop.test.ts`: DNR rule generation (domains, subdomains, redirect vs block, removal, allowlist priority, URL patterns, limits, module off), input validation, schedules (including windows across midnight), next-boundary calculation, the focus state machine (cycles, pause/resume, ending early, catch-up), usage maths (midnight split, sleep clamp, top sites, daily totals, limits).
- `usage-tracker.test.ts`: the service-worker tracker with mocked Chrome APIs. Covers crediting the active domain, tab switches, idle, unfocused and `chrome://` handling, the sleep cap, stopping on idle, the tracking toggle, and limit enforcement.
- `nightshift.test.ts`: resolution order (module, quick switch, exclusions, site disable, site prefs, schedule), schedule timing, CSS generation (neutral = none, inversion, dark-page skip, typography excludes code and icons), luminance.
- `snappage.test.ts`: editor state (add, undo/redo, degenerate shapes, crop clamping, region-capture crop, resize, hit-testing and moving, update/remove), restricted-URL detection, capture error messages.
- `dashboard.test.ts`: layout operations and repair of invalid layouts, the widget registry, layout persistence, shortcut operations (validation, duplicates, folders, bookmark import with deduping and skipping `javascript:` URLs), task views and due-date labels, note search and export, greetings, 12/24-hour formatting, search URL resolution.

## Not covered by automation (stated honestly)

| Item | Why | Mitigation |
| --- | --- | --- |
| Usage tracking end-to-end | Headless Chromium reports the OS as **idle**, and the tracker correctly pauses when idle. The test detects this and skips with a reason. | Full tracker logic is unit-tested with mocked `idle`, `windows` and `tabs` APIs. Verify manually in headed Chrome. |
| Capture through a real toolbar click (`activeTab`) | Automation can't click the browser toolbar. The E2E build grants `<all_urls>` instead, so the real capture pipeline still runs. | Verify manually: popup → Visible / Region / Full page on a normal site. |
| `chrome://` capture refusal end-to-end | Without a real `activeTab` invocation, Chrome returns a different error than in real use. | The message mapping for both Chrome errors is unit-tested. The popup hides capture buttons when the tab URL isn't visible. |
| Optional permission dialogs (site access, bookmarks) | Chrome's permission prompt can't be driven by Playwright. | Grant and revoke manually in Settings → Permissions. The no-permission fallbacks (plain DNR block, per-tab NightShift) are the default code path and covered by unit tests. |
| Region selection overlay drag | Not automated. | The crop maths it feeds is covered by the editor E2E test. Verify manually. |
| Real-world sites (YouTube, Gmail and similar) | Tests use a local fixture server so they work offline and stay deterministic. | Spot-check NightShift and full-page capture on popular sites manually. |
| Google Chrome stable (branded) | Chrome stable no longer supports `--load-extension` for automation; tests use Playwright's Chromium. | Load `dist/` unpacked in Chrome stable for a final manual pass. |
| Screen readers | Accessibility comes from roles, labels, focus management and keyboard drag-and-drop in the code, but wasn't tested with VoiceOver or NVDA. | Recommended before a public release. |

## Recommended manual pass before release

1. Load `dist/` in Chrome stable and go through onboarding.
2. Grant site access, then check:
   - visiting a blocked site shows the Brewtab blocked page;
   - screen time appears after a few minutes of browsing.
3. On a normal site, use the popup to:
   - turn NightShift on for that site;
   - open reading mode;
   - capture the visible area, a region and the full page.
4. Restart Chrome during a focus session and confirm it continues.
5. Revoke site access and confirm the fallbacks behave as described.

## Bugs found and fixed during testing

- **Race condition:** overlapping `syncNightShift()` calls could register the content script twice ("Duplicate script ID"). It's now serialised.
- **Dialog forms:** the shortcut and widget-settings dialogs filled their forms after paint, so fast input could be overwritten. They now fill in a layout effect.
- **Text annotation:** the text box closed immediately in the editor because the browser's mousedown focus change blurred it.
- **Capture errors:** Chrome's generic "Cannot access contents" error on protected pages now produces a clear message.
- **Widget layout:** the Notes widget overflowed its card, and the Tasks filter was clipped.
- **Theme contrast:** Glass-theme inputs were unreadable, and Nature-theme hero text had low contrast.
