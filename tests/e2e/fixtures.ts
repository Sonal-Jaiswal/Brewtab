// Loads the unpacked E2E build into Playwright's Chromium with a fresh profile.
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXT_PATH = fileURLToPath(new URL('../../dist-e2e', import.meta.url));

export async function launchWithExtension(userDataDir = mkdtempSync(join(tmpdir(), 'brewtab-e2e-'))) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = new URL(sw.url()).host;
  return { context, sw, extensionId, userDataDir };
}

type Fixtures = { context: BrowserContext; sw: Worker; extensionId: string; extUrl: (path: string) => string; userDataDir: string };

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, testInfo) => {
    const dir = mkdtempSync(join(tmpdir(), 'brewtab-e2e-'));
    const { context } = await launchWithExtension(dir);
    (testInfo as unknown as { _userDataDir: string })._userDataDir = dir;
    await use(context);
    await context.close();
  },
  userDataDir: async ({ context }, use, testInfo) => {
    void context;
    await use((testInfo as unknown as { _userDataDir: string })._userDataDir);
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  extUrl: async ({ extensionId }, use) => {
    await use((path: string) => `chrome-extension://${extensionId}/${path}`);
  },
});

export const expect = test.expect;
