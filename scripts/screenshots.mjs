// Captures screenshots of every Brewtab surface with demo content, for review
// and the Chrome Web Store listing (1280×800). Usage: npm run screenshots
// Requires `npm run build` first.
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'store', 'screenshots');
mkdirSync(out, { recursive: true });

const DAY = 86_400_000;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function launch(dist) {
  const ext = join(root, dist);
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'brewtab-shots-')), {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  return { context, sw, url: (p) => `chrome-extension://${id}/${p}` };
}

async function seed(sw, page, theme = 'minimal-light') {
  const now = Date.now();
  await sw.evaluate(async (theme) => {
    await chrome.storage.local.set({
      settings: {
        onboarded: true,
        profile: { name: 'Alex' },
        appearance: { theme },
        scrollstop: {
          blocklist: ['youtube.com', 'reddit.com', 'x.com', 'instagram.com'].map((value, i) => ({ id: `r${i}`, kind: 'domain', value, enabled: true, createdAt: i })),
          allowlist: [{ id: 'a1', kind: 'pattern', value: 'youtube.com/watch?v=lecture*', enabled: true, createdAt: 1 }],
          schedules: [
            { id: 's1', name: 'Deep work', enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '12:30' },
            { id: 's2', name: 'Wind down', enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '07:00' },
          ],
          limits: [{ id: 'l1', domain: 'youtube.com', minutes: 30, enabled: true }, { id: 'l2', domain: 'reddit.com', minutes: 15, enabled: true }],
        },
      },
    });
  }, theme);
  await page.evaluate(
    async ({ now, DAY, days }) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('brewtab');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const put = (store, items) =>
        new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          items.forEach((i) => tx.objectStore(store).put(i));
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
      const t = (id, title, extra = {}) => ({ id, title, notes: '', done: false, due: null, priority: 'medium', category: '', createdAt: now - 1000, updatedAt: now - 1000, completedAt: null, ...extra });
      await put('tasks', [
        t('t1', 'Finish quarterly report draft', { due: days[0], priority: 'high', category: 'Work' }),
        t('t2', 'Review design feedback', { due: days[0], category: 'Work' }),
        t('t3', 'Book dentist appointment', { due: days[-2], priority: 'high', category: 'Personal' }),
        t('t4', 'Call Mum', { priority: 'low', category: 'Personal' }),
        t('t5', 'Plan weekend hike', { due: days[2], category: 'Personal' }),
        t('t6', 'Water the plants', { done: true, completedAt: now - 3600_000 }),
      ]);
      const n = (id, title, body, pinned, ago) => ({ id, title, body, pinned, createdAt: now - ago * 2, updatedAt: now - ago });
      await put('notes', [
        n('n1', 'Ideas for the offsite', 'Morning: retro & roadmap\nAfternoon: hike + long lunch\nAsk Priya about venue', true, 3600_000),
        n('n2', 'Books to read', 'The Overstory\nFour Thousand Weeks\nThe Creative Act', false, 2 * DAY),
        n('n3', 'Coffee order', 'Oat flat white, extra hot', false, 5 * DAY),
      ]);
      const link = (id, title, url, folderId = null) => ({ id, title, url, icon: { kind: 'letter' }, folderId, category: '', createdAt: now });
      await put('dashboard', [
        {
          id: 'quicklinks',
          folders: [{ id: 'f1', name: 'Work' }, { id: 'f2', name: 'Reading' }],
          links: [
            link('l1', 'Gmail', 'https://mail.google.com', 'f1'),
            link('l2', 'Calendar', 'https://calendar.google.com', 'f1'),
            link('l3', 'GitHub', 'https://github.com', 'f1'),
            link('l4', 'Notion', 'https://www.notion.so', 'f1'),
            link('l5', 'Figma', 'https://www.figma.com', 'f1'),
            link('l6', 'Wikipedia', 'https://www.wikipedia.org', 'f2'),
            link('l7', 'Hacker News', 'https://news.ycombinator.com', 'f2'),
            link('l8', 'Spotify', 'https://open.spotify.com'),
          ],
        },
      ]);
      const sites = [['github.com', 5400], ['docs.google.com', 3900], ['mail.google.com', 2100], ['youtube.com', 1500], ['figma.com', 1300], ['news.ycombinator.com', 700]];
      const usage = [];
      for (let i = 0; i < 7; i++) {
        const date = days[-i];
        for (const [domain, base] of sites) usage.push({ key: `${date}|${domain}`, date, domain, seconds: Math.round(base * (0.55 + ((i * 37 + domain.length * 11) % 50) / 60)) });
      }
      await put('usage', usage);
      await put('focusSessions', [0, 1, 2, 3].map((i) => ({ id: `f${i}`, startedAt: now - i * 0.7 * DAY - 7200_000, endedAt: now - i * 0.7 * DAY, plannedMinutes: 100, focusedMs: (i % 2 ? 50 : 100) * 60_000, cyclesCompleted: i % 2 ? 2 : 4, completed: i % 2 === 0 })));
      db.close();
    },
    { now, DAY, days: Object.fromEntries([-6, -5, -4, -3, -2, -1, 0, 1, 2].map((o) => [o, dayKey(new Date(now + o * DAY))])) },
  );
}

async function shot(page, name, opts = {}) {
  await page.bringToFront();
  await page.waitForTimeout(opts.wait ?? 700);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: !!opts.fullPage, clip: opts.clip });
  console.log('saved', name);
}

// ---------- Release build ----------
{
  const { context, sw, url } = await launch('dist');
  const page = await context.newPage();
  await page.goto(url('newtab.html'));
  await page.bringToFront();
  await page.waitForTimeout(800);
  await shot(page, '00-onboarding');

  await seed(sw, page);
  for (const theme of ['minimal-light', 'midnight', 'nature', 'glass']) {
    await sw.evaluate(async (theme) => {
      const s = (await chrome.storage.local.get('settings')).settings;
      s.appearance.theme = theme;
      await chrome.storage.local.set({ settings: s });
    }, theme);
    await page.reload();
    await page.getByRole('search').waitFor();
    await page.locator('[data-widget=tasks] li').first().waitFor();
    await page.mouse.click(5, 790);
    await shot(page, `01-dashboard-${theme}`);
  }
  await sw.evaluate(async () => {
    const s = (await chrome.storage.local.get('settings')).settings;
    s.appearance.theme = 'minimal-light';
    await chrome.storage.local.set({ settings: s });
  });
  await page.reload();
  await page.getByRole('search').waitFor();
  await shot(page, '02-dashboard-full', { fullPage: true });

  await page.getByRole('button', { name: 'Customise dashboard' }).click();
  await page.evaluate(() => window.scrollTo(0, 420));
  await shot(page, '03-dashboard-customise');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.getByRole('button', { name: 'Change theme' }).click();
  await shot(page, '04-theme-switcher');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 790);

  await page.locator('[data-widget=tasks]').getByText('Finish quarterly report draft').click();
  await shot(page, '05-task-editor');
  await page.keyboard.press('Escape');

  const settings = await context.newPage();
  for (const [id, name] of [['scrollstop', '06-settings-scrollstop'], ['appearance', '07-settings-appearance'], ['data', '08-settings-data'], ['permissions', '09-settings-permissions']]) {
    await settings.goto(url(`settings.html#${id}`));
    await settings.getByRole('heading', { level: 1 }).waitFor();
    await shot(settings, name);
  }
  await settings.goto(url('settings.html#scrollstop'));
  await settings.getByRole('heading', { name: 'Reports' }).scrollIntoViewIfNeeded();
  await shot(settings, '10-scrollstop-reports');

  const blocked = await context.newPage();
  await blocked.goto(url('blocked.html?reason=limit#https://www.youtube.com/'));
  await shot(blocked, '11-blocked-page');

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(url('popup.html'));
  await shot(popup, '12-popup', { fullPage: true });
  await context.close();
}
