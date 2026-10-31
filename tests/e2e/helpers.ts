import type { BrowserContext, Page, Worker } from '@playwright/test';

export const FIXTURE = 'http://localhost:4599';

/** Merge a patch into stored settings from the service worker. */
export async function patchSettings(sw: Worker, patch: Record<string, unknown>): Promise<void> {
  await sw.evaluate(async (p) => {
    const cur = ((await chrome.storage.local.get('settings')).settings ?? {}) as Record<string, unknown>;
    const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
      const out = { ...a };
      for (const [k, v] of Object.entries(b)) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
      }
      return out;
    };
    await chrome.storage.local.set({ settings: merge(cur, p) });
  }, patch);
}

export async function openDashboard(context: BrowserContext, sw: Worker, extUrl: (p: string) => string, onboarded = true): Promise<Page> {
  if (onboarded) await patchSettings(sw, { onboarded: true });
  const page = await context.newPage();
  await page.goto(extUrl('newtab.html'));
  await page.bringToFront();
  await page.getByRole('search').waitFor();
  return page;
}

export async function dynamicRules(sw: Worker): Promise<chrome.declarativeNetRequest.Rule[]> {
  return sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
}

type TestHooks = Record<string, (...args: unknown[]) => Promise<unknown>>;

export async function hook(sw: Worker, name: string, ...args: unknown[]): Promise<unknown> {
  return sw.evaluate(
    ([n, a]) => (globalThis as unknown as { brewtabTest: TestHooks }).brewtabTest[n as string](...(a as unknown[])),
    [name, args] as const,
  );
}

/** Wait until the service worker's async storage listeners have settled. */
export async function settle(sw: Worker): Promise<void> {
  await hook(sw, 'syncBlocking');
}
