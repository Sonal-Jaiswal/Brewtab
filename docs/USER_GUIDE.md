# Brewtab user guide

## Getting started

Open a new tab. The first time, a short setup asks for your name, a theme, a search engine, whether to use ScrollStop and a few starter shortcuts. **Skip setup** is available at every step, and every choice can be changed later in **Settings** (the gear icon, top right).

## The dashboard

- **Search.** Type and press Enter. Typing an address such as `github.com/settings` opens it directly. Alt+Enter opens the result in a background tab. Press `/` or Ctrl/⌘+K anywhere to jump to search. Change the engine from the button at the left of the bar. **Chrome default** uses the engine set in Chrome.
- **Shortcuts.** Click **Add**, enter an address, and optionally set a name, folder and icon (letter, emoji or your own image). Brewtab warns you about duplicates. Right-click a shortcut (or press Shift+F10) to edit, copy or delete it. Drag shortcuts to reorder them; with the keyboard, focus a shortcut, press Space, use the arrow keys, then press Space again. Folders appear as tabs above the shortcuts; right-click a folder to rename or delete it, and its shortcuts are kept. To import bookmarks, use **Import** (or **Import Chrome bookmarks** in customise mode) and pick folders.
- **Customise.** The layout button, top right, turns on customise mode:
  - drag the handle on a widget to move it;
  - use ⤢ to resize, ⚙ for widget settings and 🗑 to remove;
  - **Add widget** adds one, and **Reset** restores the default layout.
- **Themes.** Use the palette button for quick switching. **Settings → Appearance** has wallpaper upload, background opacity and blur, widget transparency, text colour, corner radius, spacing and animation options.

### Widgets

- **Tasks.** Quick-add with Enter. In the **Today** view, new tasks are due today. Use the pencil button for due date, priority, category and notes, and click a task to edit it. Views are Today (due today, overdue and undated), All, Overdue and Done. Deleting a task offers Undo.
- **Notes.** Notes save automatically as you type. Search covers titles and text. Pinned notes stay on top. Export everything as Markdown or JSON. Wide widgets show the list and the editor side by side.
- **Focus.** Start your configured work/break cycle (25 + 5 minutes × 4 by default) or a single 15-, 25- or 50-minute block. While a work block runs, your ScrollStop blocklist is enforced.
- **Screen time.** Today's and this week's browsing time per site. Needs ScrollStop tracking and site access.
- **Bookmarks.** Browse your Chrome bookmark folders. Needs bookmarks access.
- **Daily quote.** A short quote that changes every day.

## ScrollStop

Configure it in **Settings → ScrollStop**. The switch at the top of that page (also in the toolbar popup) turns ScrollStop on or off. When it's off, nothing is blocked or tracked.

- **Blocklist.** A domain (`youtube.com`) also blocks its subdomains. A URL pattern (`youtube.com/shorts/*`) targets part of a site.
- **Allowlist.** Always allowed, even when a broader rule matches (for example, `docs.google.com` while `google.com` is blocked).
- **When blocking applies:**
  - all the time ("Block all the time");
  - during focus work blocks;
  - during schedules, such as "Weekdays 09:00–17:00". Windows may cross midnight.
- **Daily limits.** After N minutes on a site today, it's blocked until midnight. Raising, turning off or removing the limit unblocks it straight away.
- **Blocked page.** With site access, blocked sites show Brewtab's page with the reason, the time left in your focus block and a "Go back" button. Without it, Chrome shows its standard "blocked" error page.
- **Quick actions.** The popup's **Add to blocklist** button, or right-click a page → **ScrollStop: add this site to blocklist**. Like every blocklist entry, the site is then blocked while you focus, during a schedule, or all the time if **Block all the time** is on. The popup says which applies.

## Your data

**Settings → Data & backup**:

- **Download backup**, optionally including wallpapers.
- **Restore or import.** You see what's in the file first, then choose:
  - **Merge:** adds what's missing; for items in both, the newer edit wins.
  - **Replace:** a safety copy of your current data is saved first and can be restored from the same page.
- **Erase all data:** type DELETE to confirm.

## Permissions

**Settings → Permissions** shows each permission, why it's needed, and Allow/Remove buttons for the optional ones.
