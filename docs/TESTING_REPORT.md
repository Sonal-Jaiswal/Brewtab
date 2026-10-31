# Testing report — Brewtab 1.0.0

*Final run: 31 October 2026 · macOS (Darwin 27.2) · Node 24.2 · Playwright 1.64.1 with its bundled Chromium (headless)*

Brewtab 1.0.0 contains the dashboard and ScrollStop. NightShift and SnapPage were removed before release, together with their tests (see the single-purpose decision in [STORE_LISTING.md](STORE_LISTING.md)).

## Results

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npm run typecheck` | ✅ 0 errors |
| Unit & integration | `npm test` | ✅ **61 / 61 passed** (4 files) |
| End-to-end (real extension in Chromium) | `npm run test:e2e` | ✅ **34 passed, 0 skipped, 0 failed** |
| Dependency audit | `npm audit` | ✅ 0 vulnerabilities |
| Release package checks | `npm run package` | ✅ MV3; no host permissions; no test hooks; no eval or remote code; 68 files, 490 KB ZIP |

Flakiness check: the whole E2E suite was also run twice back to back (`--repeat-each=2`, 68 runs) while the machine was under heavy load. 67 passed. One failed before its test started, because Chromium took more than 45 seconds to launch; that test (widget layout) then passed 5 times out of 5. The shortcuts test was also run ten times, and all passed.

## What the end-to-end tests cover

Each test launches Chromium with a **fresh profile** and the unpacked E2E build, and drives the real UI.

**Dashboard**

- Fresh install opens onboarding. Completing it persists name, theme, search engine, the ScrollStop choice and starter shortcuts across reloads. Onboarding can also be skipped.
- Tasks: create, edit (title, priority, category), complete, view in Done, delete, persistence across reloads, and the overdue view.
- Notes: create with autosave, pin, search, persistence, and Markdown export (file download).
- Widgets: remove, add from the registry, keyboard drag-and-drop reorder, resize, persistence across reloads, and reset to default. Widgets that depend on ScrollStop hide when it's turned off in Settings.
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

- A block rule added in Settings, with "always block" on, redirects a real navigation to the blocked page, whose **ScrollStop settings** button opens the ScrollStop section. Removing the rule unblocks it.
- Clicking a link to a blocked site on another site also opens the blocked page.
- URL-pattern rules and allowlist precedence.
- A focus session started from the popup blocks sites (the blocked page shows the countdown), pauses, resumes and ends, writing a history record.
- Alarm-driven phase completion, including catch-up after missed wake-ups.
- A schedule active now creates rules and a boundary alarm; one outside the window creates none.
- Active-tab usage tracking and daily-limit enforcement (skipped automatically when the OS reports itself idle; see below). Removing a daily limit in Settings unblocks the site at once.
- Schedule editor: adding a schedule, and discarding cancelled edits.
- Turning ScrollStop off removes all rules and ends a running focus session, clearing its badge and alarm.

**Popup and lifecycle**

- The popup's ScrollStop switch updates settings and hides the focus timer.
- On a website, the popup adds the site to the blocklist, says when it will be blocked, shows "Blocked now" once a focus session starts, and removes it again. The test supplies the active tab that a real toolbar click would give the popup.
- **Browser restart:** tasks, an in-progress focus session, its alarm and its DNR rules all survive closing and relaunching the same profile, and onboarding doesn't reappear.
- Backup download, erase-all (back to fresh-install state) and merge import restore the data.
- All 8 settings sections render.

## Unit and integration tests (61)

- `storage.test.ts`:
  - settings defaults, partial updates, serialised concurrent updates, migration of old or partial data, corrupt-data recovery;
  - task, note and usage repositories, persistence across DB reconnects;
  - backup round-trip, invalid-file rejection, dropping invalid records;
  - merge keeps newer local items, replace snapshot plus restore (undo);
  - shortcut merge without duplicates.
- `scrollstop.test.ts`: DNR rule generation (domains, subdomains, redirect vs block, removal, allowlist priority, URL patterns, limits, module off), input validation, schedules (including windows across midnight), next-boundary calculation, the focus state machine (cycles, pause/resume, ending early, catch-up), usage maths (midnight split, sleep clamp, top sites, daily totals, limits), and detection of browser pages extensions can't act on.
- `usage-tracker.test.ts`: the service-worker tracker with mocked Chrome APIs. Covers crediting the active domain, tab switches, idle, unfocused and `chrome://` handling, the sleep cap, stopping on idle, the tracking toggle, limit enforcement, and unblocking when a limit is raised, turned off or removed.
- `dashboard.test.ts`: layout operations and repair of invalid layouts, the widget registry, layout persistence, shortcut operations (validation, duplicates, folders, bookmark import with deduping and skipping `javascript:` URLs), task views and due-date labels, note search and export, greetings, 12/24-hour formatting, search URL resolution.

## Not covered by automation (stated honestly)

| Item | Why | Mitigation |
| --- | --- | --- |
| Usage tracking end-to-end | The tracker correctly pauses when the OS is idle, and headless Chromium often reports it as idle. The test then skips itself with a reason. In the final runs it wasn't skipped, and it passed. | Full tracker logic is unit-tested with mocked `idle`, `windows` and `tabs` APIs. Verify manually in headed Chrome. |
| A real toolbar click opening the popup | Automation can't click the browser toolbar, which is what gives the popup the active tab through `activeTab`. The popup test supplies that tab itself. | Verify manually: on a normal site, open the popup and use **Add to blocklist**. |
| Right-click **ScrollStop: add this site to blocklist** | Playwright can't open Chrome's context menu. | Verify manually on a normal site. |
| Optional permission dialogs (site access, bookmarks) | Chrome's permission prompt can't be driven by Playwright. | Grant and revoke manually in Settings → Permissions. The no-permission fallback (a plain DNR block) is the default code path and covered by unit tests. |
| Real-world sites (YouTube, Gmail and similar) | Tests use a local fixture server so they work offline and stay deterministic. | Spot-check blocking and screen time on popular sites manually. |
| Google Chrome stable (branded) | Chrome stable no longer supports `--load-extension` for automation; tests use Playwright's Chromium. | Load `dist/` unpacked in Chrome stable for a final manual pass. |
| Screen readers | Accessibility comes from roles, labels, focus management and keyboard drag-and-drop in the code, but wasn't tested with VoiceOver or NVDA. | Recommended before a public release. |

## Recommended manual pass before release

1. Load `dist/` in Chrome stable and go through onboarding.
2. Grant site access, then check:
   - visiting a blocked site shows the Brewtab blocked page;
   - screen time appears after a few minutes of browsing.
3. On a normal site, open the popup and use **Add to blocklist**. Start a focus session (or turn on **Block all the time**), then reload the site and click a link to it from another site to confirm both show the blocked page. Remove it from the popup afterwards. Try right-click → **ScrollStop: add this site to blocklist** too.
4. Restart Chrome during a focus session and confirm it continues.
5. Revoke site access and confirm the fallbacks behave as described.

## Bugs found and fixed during testing

- **Link clicks to blocked sites:** with site access, a typed address showed Brewtab's blocked page, but clicking a link to a blocked site showed Chrome's error page, headed with the extension's ID. Chrome only redirects page-started navigations to web-accessible extension pages, so `blocked.html` is now web accessible.
- **ScrollStop off during a focus session:** the session kept running in the background. The toolbar badge kept counting down, and break notifications would still have fired. Turning ScrollStop off now ends the session.
- **Daily limits:** removing, turning off or raising a limit left the site blocked until midnight, because the list of sites over their limit only ever grew. It's now recomputed whenever settings change.
- **Schedule editor:** cancelled edits reappeared when the same schedule was opened again.
- **Blocked page:** **ScrollStop settings** opened the General section.
- **Popup:** **Block site** only added the site to the blocklist, which blocks it during focus sessions and schedules, so nothing seemed to happen with default settings. It's now **Add to blocklist**, with a line saying when the site is blocked, and the popup refreshes when a focus session starts. On Brewtab's own new tab it said "Browser pages can't be changed by extensions"; it now says it's a Brewtab page.
- **Dialog forms:** the shortcut and widget-settings dialogs filled their forms after paint, so fast input could be overwritten. They now fill in a layout effect.
- **Widget layout:** the Notes widget overflowed its card, and the Tasks filter was clipped.
- **Theme contrast:** Glass-theme inputs were unreadable, and Nature-theme hero text had low contrast.
- **Flaky shortcuts test:** a new shortcut appears in the list before its dialog closes, because the dialog waits for the save to be written. The test sometimes clicked **Add shortcut** again in that moment and found two buttons. It failed 1 run in 5 on the code before the module removal too. The test now waits for the dialog to close; the extension itself was fine.
