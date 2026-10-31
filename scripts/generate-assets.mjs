// Renders extension icons (PNG) from the brand SVG using headless Chromium.
// Usage: npm run assets
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });

// The 128px icon keeps 96px of artwork with 16px transparent padding (Chrome Web Store guideline).
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${size === 128 ? '-13.33 -13.33 154.67 154.67' : '0 0 128 128'}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c8743a"/>
      <stop offset="1" stop-color="#9a4f1f"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="116" height="116" rx="32" fill="url(#g)"/>
  <path d="M36 58h48v18a20 20 0 0 1-20 20h-8a20 20 0 0 1-20-20V58Z" fill="#fff8ef"/>
  <path d="M84 63h5a9 9 0 0 1 0 18h-6" stroke="#fff8ef" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M50 46c0-7 6-7 6-14M66 46c0-7 6-7 6-14" stroke="#fff8ef" stroke-width="${size <= 16 ? 8 : 6.5}" stroke-linecap="round" fill="none" opacity=".9"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  const png = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(`${out}icon-${size}.png`, png);
  console.log(`icon-${size}.png`);
}
writeFileSync(`${out}icon.svg`, svg(128).trim());
await browser.close();

// ---------- Store promotional tiles (rendered from local HTML, no remote assets) ----------
const storeDir = fileURLToPath(new URL('../store/', import.meta.url));
mkdirSync(storeDir, { recursive: true });
const tile = (w, h, big) => `<html><body style="margin:0">
<div style="width:${w}px;height:${h}px;box-sizing:border-box;padding:${big ? 64 : 28}px;display:flex;flex-direction:column;justify-content:center;
background:radial-gradient(700px 400px at 10% -10%,#fbe0c3,transparent 60%),radial-gradient(600px 400px at 110% 120%,#e6dcf3,transparent 60%),#f5f1ea;
font-family:Georgia,'Iowan Old Style',serif;color:#221d18;position:relative;overflow:hidden">
  <div style="display:flex;align-items:center;gap:${big ? 18 : 12}px">${svg(big ? 72 : 44)}<span style="font-size:${big ? 54 : 34}px;letter-spacing:-.02em">Brewtab</span></div>
  <div style="font-size:${big ? 38 : 22}px;margin-top:${big ? 22 : 12}px;letter-spacing:-.01em">Start every tab fresh.</div>
  <div style="font:${big ? 20 : 13}px/1.45 -apple-system,'Segoe UI',sans-serif;color:#6f665d;margin-top:${big ? 14 : 8}px;max-width:${big ? 640 : 340}px">
    Tasks, notes &amp; focus on your new tab · Block distractions · Dark mode for any site · Screenshots &amp; markup. Free, private, local-only.</div>
</div></body></html>`;
const promo = await chromium.launch();
const pp = await promo.newPage({ deviceScaleFactor: 1 });
for (const [name, w, h, big] of [['promo-small-440x280', 440, 280, false], ['promo-marquee-1400x560', 1400, 560, true]]) {
  await pp.setViewportSize({ width: w, height: h });
  await pp.setContent(tile(w, h, big));
  writeFileSync(`${storeDir}${name}.png`, await pp.screenshot());
  console.log(`${name}.png`);
}
await promo.close();
