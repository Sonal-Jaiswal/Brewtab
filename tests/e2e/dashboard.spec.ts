import { test, expect } from './fixtures';
import { openDashboard, patchSettings } from './helpers';

test.describe('fresh install & onboarding', () => {
  test('opens onboarding on install, can be completed, and persists', async ({ context, sw, extUrl }) => {
    const page = await context.newPage();
    await page.goto(extUrl('newtab.html'));
    await page.bringToFront();
    const dialog = page.getByRole('dialog', { name: 'Welcome to Brewtab' });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('Your first name (optional)').fill('Ada');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: /Midnight/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: 'DuckDuckGo' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('switch', { name: 'Enable ScrollStop' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: 'Start using Brewtab' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText(/, Ada$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gmail' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
    await expect(page.getByRole('button', { name: /Search engine: DuckDuckGo/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome to Brewtab' })).toHaveCount(0);
    const settings = (await sw.evaluate(async () => (await chrome.storage.local.get("settings")).settings)) as { modules: Record<string, boolean> };
    expect(settings.modules.scrollstop).toBe(false);
  });

  test('onboarding can be skipped', async ({ context, extUrl }) => {
    const page = await context.newPage();
    await page.goto(extUrl('newtab.html'));
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('dialog', { name: 'Welcome to Brewtab' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome to Brewtab' })).toHaveCount(0);
  });
});

test.describe('tasks', () => {
  test('create, edit, complete, delete and persist', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    const tasks = page.locator('[data-widget=tasks]');
    await tasks.getByLabel('New task').fill('Write the report');
    await tasks.getByLabel('New task').press('Enter');
    await expect(tasks.getByText('Write the report')).toBeVisible();

    await tasks.getByText('Write the report').click();
    const editor = page.getByRole('dialog', { name: 'Edit task' });
    await editor.getByRole('textbox').first().fill('Write the final report');
    await editor.getByRole('combobox').first().selectOption('high');
    await editor.getByPlaceholder('e.g. Work').fill('Work');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(tasks.getByText('Write the final report')).toBeVisible();
    await expect(tasks.getByText('high')).toBeVisible();

    await page.reload();
    await expect(tasks.getByText('Write the final report')).toBeVisible();

    await tasks.getByRole('checkbox', { name: /Mark “Write the final report” done/ }).click();
    await expect(tasks.getByText('Write the final report')).toHaveCount(0);
    await tasks.getByRole('tab', { name: /Done/ }).click();
    await expect(tasks.getByText('Write the final report')).toBeVisible();

    await tasks.getByText('Write the final report').hover();
    await tasks.getByRole('button', { name: 'Task actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(tasks.getByText('Write the final report')).toHaveCount(0);
    await page.reload();
    await tasks.getByRole('tab', { name: /Done/ }).click();
    await expect(tasks.getByText('No completed tasks yet')).toBeVisible();
  });

  test('overdue tasks appear in the overdue view', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    const tasks = page.locator('[data-widget=tasks]');
    await tasks.getByRole('button', { name: 'Add task with details' }).click();
    const dialog = page.getByRole('dialog', { name: 'New task' });
    await dialog.getByPlaceholder('What needs doing?').fill('Old bill');
    await dialog.locator('input[type=date]').fill('2020-01-01');
    await dialog.getByRole('button', { name: 'Add task' }).click();
    await tasks.getByRole('tab', { name: /Overdue/ }).click();
    await expect(tasks.getByText('Old bill')).toBeVisible();
    await expect(tasks.getByText(/overdue/i).last()).toBeVisible();
  });
});

test.describe('notes', () => {
  test('create with autosave, search, pin and persist', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    const notes = page.locator('[data-widget=notes]');
    await notes.getByRole('button', { name: 'New note' }).click();
    await notes.getByLabel('Note title').fill('Groceries');
    await notes.getByLabel('Note text').fill('Coffee beans\nOat milk');
    await expect(notes.getByText(/^Saved/)).toBeVisible();
    await notes.getByRole('button', { name: 'Pin note' }).click();
    await notes.getByRole('button', { name: 'Back to notes' }).click();

    await notes.getByRole('button', { name: 'New note' }).click();
    await notes.getByLabel('Note text').fill('Meeting ideas');
    await notes.getByRole('button', { name: 'Back to notes' }).click();

    await page.reload();
    await expect(notes.getByRole('button', { name: /Groceries/ })).toBeVisible();
    await notes.getByLabel('Search notes').fill('oat');
    await expect(notes.getByRole('button', { name: /Groceries/ })).toBeVisible();
    await expect(notes.getByRole('button', { name: /Meeting ideas/ })).toHaveCount(0);
    await notes.getByLabel('Search notes').fill('');
    // Pinned note is listed first.
    await expect(notes.locator('li button').first()).toContainText('Groceries');
  });

  test('exports notes as markdown', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    const notes = page.locator('[data-widget=notes]');
    await notes.getByRole('button', { name: 'New note' }).click();
    await notes.getByLabel('Note title').fill('Export me');
    await notes.getByRole('button', { name: 'Back to notes' }).click();
    await notes.getByRole('button', { name: 'Export notes' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export as Markdown' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^brewtab-notes_.*\.md$/);
  });
});

test.describe('widgets & layout', () => {
  test('remove, add, resize and reorder widgets with persistence', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    const grid = page.getByTestId('widget-grid');
    const order = () => grid.locator('article').evaluateAll((els) => els.map((e) => e.getAttribute('data-widget')));
    expect(await order()).toEqual(['tasks', 'focus', 'notes', 'quote']);

    await page.getByRole('button', { name: 'Customise dashboard' }).click();
    await page.locator('[data-widget=quote]').getByRole('button', { name: 'Remove widget' }).click();
    expect(await order()).toEqual(['tasks', 'focus', 'notes']);

    await page.getByRole('button', { name: 'Add widget' }).click();
    await page.getByRole('dialog', { name: 'Add a widget' }).getByRole('button', { name: /Screen time/ }).click();
    expect(await order()).toEqual(['tasks', 'focus', 'notes', 'usage']);

    // Keyboard drag-and-drop: move Focus one slot left, before Tasks.
    const handle = page.getByRole('button', { name: 'Move Focus widget' });
    await handle.focus();
    // dnd-kit measures layout between key presses, as a real keyboard user's pace allows.
    for (const key of ['Space', 'ArrowLeft', 'Space']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
    }
    await expect.poll(order).toEqual(['focus', 'tasks', 'notes', 'usage']);

    await page.locator('[data-widget=tasks]').getByRole('button', { name: 'Resize widget' }).click();
    await page.getByRole('menuitem', { name: 'Wide & tall' }).click();
    await expect(page.locator('[data-widget=tasks]')).toHaveClass(/md:col-span-2/);


    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    expect(await order()).toEqual(['focus', 'tasks', 'notes', 'usage']);
    await expect(page.locator('[data-widget=tasks]')).toHaveClass(/md:col-span-2/);

    await page.getByRole('button', { name: 'Customise dashboard' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
    expect(await order()).toEqual(['tasks', 'focus', 'notes', 'quote']);
  });

  test('module-dependent widgets hide when the module is off', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    await expect(page.locator('[data-widget=focus]')).toBeVisible();
    const settings = await context.newPage();
    await settings.goto(extUrl('settings.html#scrollstop'));
    await settings.getByRole('switch', { name: 'Enable ScrollStop' }).click();
    await page.bringToFront();
    await expect(page.locator('[data-widget=focus]')).toHaveCount(0);
  });
});

test.describe('themes & appearance', () => {
  test('theme switcher persists across reloads and tabs', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('button', { name: 'Glass' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'glass');
    const other = await context.newPage();
    await other.goto(extUrl('newtab.html'));
    await expect(other.locator('html')).toHaveAttribute('data-theme', 'glass');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'glass');
  });

  test('appearance settings apply to the dashboard', async ({ context, sw, extUrl }) => {
    await patchSettings(sw, { appearance: { radius: 4, widgetOpacity: 0.5, textColor: '#123456', background: { kind: 'color', color: '#334455' } } });
    const page = await openDashboard(context, sw, extUrl);
    const vars = await page.evaluate(() => {
      const s = document.documentElement.style;
      return { radius: s.getPropertyValue('--bt-radius'), alpha: s.getPropertyValue('--bt-widget-alpha'), fg: s.getPropertyValue('--bt-fg') };
    });
    expect(vars).toEqual({ radius: '4px', alpha: '0.5', fg: '#123456' });
  });

  test('uploads a wallpaper from the settings page', async ({ context, sw, extUrl }) => {
    await patchSettings(sw, { onboarded: true });
    const page = await context.newPage();
    await page.goto(extUrl('settings.html#appearance'));
    const png = await page.evaluate(async () => {
      const c = new OffscreenCanvas(64, 40);
      const x = c.getContext('2d')!;
      x.fillStyle = '#4a7';
      x.fillRect(0, 0, 64, 40);
      return [...new Uint8Array(await (await c.convertToBlob()).arrayBuffer())];
    });
    await page.locator('input[type=file]').setInputFiles({ name: 'wall.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await expect(page.getByText('Wallpaper added')).toBeVisible();
    const bg = (await sw.evaluate(async () => ((await chrome.storage.local.get("settings")).settings as { appearance: { background: { kind: string } } }).appearance.background));
    expect(bg.kind).toBe('image');
    const dash = await context.newPage();
    await dash.goto(extUrl('newtab.html'));
    await expect.poll(() => dash.locator('[aria-hidden] > div').first().evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^url\("blob:/);
  });
});

test.describe('shortcuts', () => {
  test('add, detect duplicates, edit and delete', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    await page.getByRole('button', { name: 'Add shortcut' }).click();
    let dialog = page.getByRole('dialog', { name: 'Add shortcut' });
    await dialog.getByPlaceholder('example.com').fill('github.com');
    await dialog.getByRole('button', { name: 'Add shortcut' }).click();
    await expect(page.getByRole('link', { name: 'Github' })).toBeVisible();
    // The link appears at once; the dialog closes only after the save is written.
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Add shortcut' }).click();
    dialog = page.getByRole('dialog', { name: 'Add shortcut' });
    await dialog.getByPlaceholder('example.com').fill('https://www.github.com/');
    await expect(dialog.getByRole('alert')).toContainText('already have this shortcut');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Github' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    dialog = page.getByRole('dialog', { name: 'Edit shortcut' });
    await dialog.getByPlaceholder('Leave blank to use the site name').fill('Code');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Code' })).toBeVisible();

    await page.getByRole('link', { name: 'Code' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('link', { name: 'Code' })).toHaveCount(0);
  });

  test('folders group shortcuts', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    await page.getByRole('button', { name: 'Customise dashboard' }).click();
    await page.getByRole('button', { name: 'Folder' }).click();
    await page.getByRole('dialog', { name: 'New folder' }).getByRole('textbox').fill('Work');
    await page.getByRole('button', { name: 'Create folder' }).click();
    await expect(page.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Add shortcut' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add shortcut' });
    await dialog.getByPlaceholder('example.com').fill('linear.app');
    await dialog.getByRole('button', { name: 'Add shortcut' }).click();
    await page.getByRole('tablist', { name: 'Shortcut folders' }).getByRole('tab', { name: 'All', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Linear' })).toBeVisible();
  });
});

test.describe('search', () => {
  test('searches with the selected provider and opens typed URLs directly', async ({ context, sw, extUrl }) => {
    await context.route(/duckduckgo\.com|example\.org/, (route) => route.fulfill({ body: '<title>ok</title>ok', contentType: 'text/html' }));
    // Default provider: Chrome's own default engine via chrome.search.
    await context.route(/google\.com/, (route) => route.fulfill({ body: '<title>ok</title>ok', contentType: 'text/html' }));
    const first = await openDashboard(context, sw, extUrl);
    await expect(first.getByRole('button', { name: /Search engine: Chrome default/ })).toBeVisible();
    await first.getByLabel('Search the web or type an address').fill('brewtab default');
    await first.getByLabel('Search the web or type an address').press('Enter');
    await first.waitForURL(/[?&]q=brewtab(\+|%20)default/);

    const page = await openDashboard(context, sw, extUrl);
    await page.getByRole('button', { name: /Search engine/ }).click();
    await page.getByRole('menuitem', { name: 'DuckDuckGo' }).click();
    const box = page.getByLabel('Search the web or type an address');
    await box.fill('calm browsing');
    await box.press('Enter');
    await page.waitForURL(/duckduckgo\.com\/\?q=calm%20browsing/);

    const page2 = await openDashboard(context, sw, extUrl);
    await page2.getByLabel('Search the web or type an address').blur();
    await page2.keyboard.press('/');
    await expect(page2.getByLabel('Search the web or type an address')).toBeFocused();
    await page2.keyboard.type('example.org/path');
    await page2.keyboard.press('Enter');
    await page2.waitForURL('https://example.org/path');
  });
});

test.describe('robustness', () => {
  test('invalid stored settings fall back to safe defaults', async ({ context, sw, extUrl }) => {
    await sw.evaluate(() => chrome.storage.local.set({ settings: { onboarded: true, appearance: { theme: 'neon', radius: 'big' }, scrollstop: { blocklist: 'oops' } } }));
    const page = await context.newPage();
    await page.goto(extUrl('newtab.html'));
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minimal-light');
  });

  test('works offline', async ({ context, sw, extUrl }) => {
    await patchSettings(sw, { onboarded: true });
    await context.setOffline(true);
    const page = await context.newPage();
    await page.goto(extUrl('newtab.html'));
    await expect(page.getByRole('search')).toBeVisible();
    await page.locator('[data-widget=tasks]').getByLabel('New task').fill('Offline task');
    await page.locator('[data-widget=tasks]').getByLabel('New task').press('Enter');
    await expect(page.getByText('Offline task')).toBeVisible();
    await context.setOffline(false);
  });

  test('no horizontal scrolling at narrow and wide widths', async ({ context, sw, extUrl }) => {
    const page = await openDashboard(context, sw, extUrl);
    for (const width of [700, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('no console errors on extension pages', async ({ context, sw, extUrl }) => {
    await patchSettings(sw, { onboarded: true });
    for (const p of ['newtab.html', 'popup.html', 'settings.html', 'blocked.html?reason=focus#https://x.com/']) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(extUrl(p));
      await page.waitForLoadState('networkidle');
      expect(errors, p).toEqual([]);
      await page.close();
    }
  });
});
