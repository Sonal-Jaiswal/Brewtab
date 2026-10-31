# Known limitations

These are honest constraints of the browser platform or of version 1.0.0.

## Platform restrictions (Chrome)

- **Restricted pages.** Extensions can't script or capture `chrome://` pages, the Chrome Web Store, other extensions' pages, or the PDF viewer. NightShift, reading mode and SnapPage are unavailable there, and the UI says so. `file://` pages need the "Allow access to file URLs" toggle on `chrome://extensions`.
- **Screenshots need a user action.** `captureVisibleTab` only works after a click on the toolbar button, a context-menu item or a keyboard shortcut (the `activeTab` grant). This is intentional, so Brewtab can't screenshot anything on its own.
- **Capture rate.** Chrome allows about two captures per second, so a full-page capture of a long page takes several seconds. Progress appears on the toolbar badge.
- **Blocking without site access** shows Chrome's generic "blocked by an extension" error page rather than Brewtab's page, because DNR redirects require host permission.
- **DNR rules affect new navigations.** Open tabs on newly blocked sites are redirected only when site access is granted, since Brewtab can't see tab URLs otherwise.

## ScrollStop

- **Screen time is an estimate.** Time counts only for the active tab in the focused Chrome window while the system isn't idle (one minute without input). It is **not** counted while Chrome is closed, the computer sleeps, or the service worker misses events. Each segment is flushed every minute and capped at 2 minutes to avoid over-counting after sleep. Time in other apps isn't counted, even with Chrome open behind them.
- **Daily limits** are checked at each one-minute flush, so a limit can be exceeded by up to about a minute.
- **Patterns** match HTTP(S) navigations in the main frame only. Sites loaded inside iframes on other sites aren't blocked.
- **It's a commitment device, not parental control.** A user can always disable the module or the extension.

## NightShift

- **Inversion-based dark mode** works well on most sites but can look wrong on sites with complex background images, CSS gradients used as images, or canvas-heavy apps. Use per-site disable or exclusions.
- **"Leave dark sites alone"** looks at the page background when it loads. Sites that switch themes later aren't re-detected until reload.
- **Text size** scales rem/em-based text. Sites using fixed pixel sizes respond less.
- **Typeface override** tries not to break icon fonts (common icon class patterns are excluded), but unusual icon-font setups may still show boxes. Exclude the site if so.
- **Iframes** are not adjusted (`allFrames: false`), to avoid breaking embedded content.
- **Reading mode** uses Mozilla Readability and works best on articles. On apps and listings it shows "No article found".

## SnapPage

- **Full-page capture** scrolls the document. Pages that scroll inside an inner container (Gmail, Slack, many web apps) capture only the visible area, with a notice. Infinite-scroll pages capture what has loaded. Lazily loaded images may be blank if they don't load during the short settle delay. Captures stop at about 30,000 pixels tall to stay within canvas limits, with a notice.
- **Fixed and sticky elements** are hidden after the first slice, so they appear once at the top. Elements that are visually fixed by other techniques may still repeat.
- **Blur** pixelates the region irreversibly in the exported image, but the original capture stays in the local library until deleted.
- **Copy to clipboard** needs the editor tab to be focused, and works in Chrome for PNG.

## Dashboard and data

- **Favicons.** Shortcut icons are letter tiles, emoji or images you upload. Brewtab doesn't fetch favicons, to avoid network requests and leaking which sites you use.
- **No sync.** Data lives in one Chrome profile; use backup and restore to move it. Cloud sync isn't part of this version.
- **Storage.** IndexedDB space is shared with the browser profile's quota. Screenshots are the main consumer, and the library keeps the last 20 by default.
- **Search suggestions** aren't shown, because they would require network requests to a provider as you type.

## Testing gaps

See [TESTING_REPORT.md](TESTING_REPORT.md). In short:

- Usage tracking can't be exercised end-to-end in headless Chromium, which reports the OS as idle; it's covered by unit tests with mocked Chrome APIs.
- `activeTab`-gated capture was tested with an E2E-only permission substitute.
- Manual testing in a regular, headed Chrome profile is still recommended before release.
