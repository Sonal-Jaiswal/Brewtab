# Known limitations

These are honest constraints of the browser platform or of version 1.0.0.

## Platform restrictions (Chrome)

- **Browser pages.** ScrollStop blocks and tracks only `http` and `https` sites. `chrome://` pages, the Chrome Web Store, other extensions' pages and local `file://` pages can't be blocked, and the popup doesn't offer **Add to blocklist** there.
- **Blocking without site access** shows Chrome's generic "blocked by an extension" error page rather than Brewtab's page, because DNR redirects require host permission.
- **DNR rules affect new navigations.** Open tabs on newly blocked sites are redirected only when site access is granted, since Brewtab can't see tab URLs otherwise.

## ScrollStop

- **Screen time is an estimate.** Time counts only for the active tab in the focused Chrome window while the system isn't idle (one minute without input). It is **not** counted while Chrome is closed, the computer sleeps, or the service worker misses events. Each segment is flushed every minute and capped at 2 minutes to avoid over-counting after sleep. Time in other apps isn't counted, even with Chrome open behind them.
- **Daily limits** are checked at each one-minute flush, so a limit can be exceeded by up to about a minute.
- **Patterns** match HTTP(S) navigations in the main frame only. Sites loaded inside iframes on other sites aren't blocked.
- **It's a commitment device, not parental control.** A user can always turn off ScrollStop or the extension.

## Dashboard and data

- **Favicons.** Shortcut icons are letter tiles, emoji or images you upload. Brewtab doesn't fetch favicons, to avoid network requests and leaking which sites you use.
- **No sync.** Data lives in one Chrome profile; use backup and restore to move it. Cloud sync isn't part of this version.
- **Storage.** IndexedDB space is shared with the browser profile's quota. Uploaded wallpapers are the main consumer.
- **Search suggestions** aren't shown, because they would require network requests to a provider as you type.

## Testing gaps

See [TESTING_REPORT.md](TESTING_REPORT.md). In short:

- The end-to-end usage-tracking test skips itself when headless Chromium reports the OS as idle, which depends on recent activity on the machine. The tracker is also covered by unit tests with mocked Chrome APIs.
- Manual testing in a regular, headed Chrome profile is still recommended before release.
