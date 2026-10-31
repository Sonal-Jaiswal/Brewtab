# Permission justifications

These are written so they can be pasted into the Chrome Web Store **Privacy practices** tab.

## Required permissions

| Permission | Install warning | Justification |
| --- | --- | --- |
| `storage` | None | Saves the user's settings locally. |
| `alarms` | None | Ends focus phases, applies scheduled blocking at the right time and resets daily limits at midnight, even after the service worker is suspended or Chrome restarts. |
| `declarativeNetRequest` | "Block content on any page" | ScrollStop blocks only the sites the user adds to their blocklist, using dynamic rules applied by Chrome. Brewtab doesn't read or modify network traffic. |
| `activeTab` | None | When the user clicks the toolbar button, lets the popup read the current tab's address so it can offer to add that site to the blocklist and show today's time on it. |
| `contextMenus` | None | Adds a "ScrollStop: add this site to blocklist" item to the page's right-click menu. |
| `idle` | None | Pauses screen-time counting when the user is away, so reports aren't inflated. |
| `notifications` | None | Tells the user when a focus block or break ends. |
| `search` | None | The "Chrome default" search option sends dashboard searches to the search engine the user chose in Chrome's settings, so Brewtab respects the existing search setting. |
| `chrome_url_overrides.newtab` | "Replace the page you see when opening a new tab" | Brewtab's core feature is the new tab dashboard. |

## Optional permissions (requested at the moment of use, removable in Settings → Permissions)

| Permission | Install warning | Justification |
| --- | --- | --- |
| Host access `*://*/*` | "Read and change all your data on all websites" (shown only when requested) | (1) ScrollStop redirects blocked sites to Brewtab's own blocked page; a DNR redirect requires host access. (2) ScrollStop screen time reads the active tab's domain to total time per site and enforce daily limits. Without this permission, blocking still works through Chrome's standard block page. |
| `bookmarks` | "Read and change your bookmarks" (shown only when requested) | Read-only use: importing bookmark folders as shortcuts and browsing folders in the Bookmarks widget. Brewtab never modifies bookmarks. |

## Not requested

`tabs`, `scripting`, `history`, `cookies`, `webRequest`, `downloads` (files are saved with a standard download link), `unlimitedStorage`, `<all_urls>` at install, and remote code of any kind. Brewtab has no content scripts.

## Web-accessible resources

Only `blocked.html` is web accessible. When someone clicks a link to a blocked site, the navigation is started by the page they were on, and Chrome refuses to redirect it to an extension page that isn't web accessible. It shows its own error page instead. This entry grants no access to anything. The page contains no user data and reads only the block reason and the blocked address from its own URL. One side effect: a website could test whether Brewtab is installed by trying to load this page.

## Remote code

All executable code is packaged in the extension. There is no `eval`, `new Function`, remote script or remotely fetched configuration. `npm run package` refuses to build a ZIP if these appear in the bundle.

## Data use declarations (Developer Dashboard)

- **Does the extension collect or use user data?**
  - **Website content:** not collected. Brewtab never reads or changes the content of web pages.
  - **Web history:** domain-level screen-time totals are stored on the device for the user-facing ScrollStop reports and limits, and are never transmitted. Declare "Web history" as handled locally if the dashboard asks about on-device processing. Otherwise, nothing is collected.
  - **Personal information:** the optional first name for the greeting is stored locally only.
- **Certifications:**
  - Data is not sold to third parties.
  - Data is not used or transferred for purposes unrelated to the item's single purpose.
  - Data is not used or transferred to determine creditworthiness or for lending.
