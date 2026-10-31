# Brewtab Privacy Policy

*Effective: 31 October 2026 · Applies to Brewtab version 1.0.0*

Brewtab is a browser extension that runs entirely on your device. It has no servers, no user accounts, no analytics and no advertising.

## Summary

- **Brewtab does not collect, transmit, sell or share any personal data.** Nothing you create or do in Brewtab is sent to the developer or any third party.
- All data stays in your browser profile on your device.
- You can export, import or erase all of it at any time (**Settings → Data & backup**).

## What Brewtab stores on your device

| Data | Purpose | Where |
| --- | --- | --- |
| Settings (name, theme, modules, search choice, blocklists, schedules, limits, NightShift preferences) | Personalise Brewtab | `chrome.storage.local` |
| Tasks, notes, shortcuts, dashboard layout | Dashboard features | IndexedDB |
| Screen time: seconds per website domain per day, kept for 90 days | ScrollStop reports and daily limits | IndexedDB |
| Focus session history (start/end times, focused minutes) | Focus reports | IndexedDB |
| Screenshots you capture or open (your last 20 by default) | SnapPage editor and library | IndexedDB |
| Wallpapers you upload (compressed) | Dashboard background | IndexedDB |
| Automatic safety copies made before an import replaces your data (last 3) | Undo for imports | IndexedDB |

Screen time is recorded only if you enable ScrollStop usage tracking **and** grant the optional site-access permission. Brewtab records only the domain (for example `github.com`) and a running total of seconds. It never records full addresses, page titles, page contents, form input, passwords or cookies.

## Website content

NightShift and reading mode change how pages look by adding CSS, and reading mode reformats the article you're viewing. SnapPage captures an image of the tab only when you ask it to. None of this content is stored except screenshots you choose to keep, and none of it leaves your device.

## Network activity

Brewtab makes no network requests of its own. Fonts, icons, themes and quotes are bundled with the extension.

When you search from the dashboard, your browser goes directly to your chosen search engine: Chrome's default, Google, Bing, DuckDuckGo or a custom address. That engine's own privacy policy applies. Brewtab doesn't see or store your searches.

## Permissions

Brewtab requests only what its features need. Site access and bookmarks are optional, requested only when you turn on a feature that uses them, and removable at any time in **Settings → Permissions**. See [PERMISSIONS.md](PERMISSIONS.md) for each permission's purpose.

## Children

Brewtab doesn't knowingly collect any information from anyone, including children.

## Deleting your data

Use **Settings → Data & backup → Erase all data**, or uninstall the extension. Chrome removes the extension's storage on uninstall.

## Changes

If this policy changes, the new version will be published with the update, and any material change will be shown in the extension before it takes effect.

## Contact

Questions: [add a support email or website before publishing]
