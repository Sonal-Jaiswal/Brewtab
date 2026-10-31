// Builds the extension in three passes:
//  1. Extension pages (React, code-split, ES modules)
//  2. Service worker (single ES module file — service workers cannot use dynamic import())
//  3. Content scripts (self-contained IIFE files — content scripts cannot be ES modules)
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createManifest } from './manifest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const e2e = args.has('--e2e');
const watch = args.has('--watch');
const outDir = resolve(root, e2e ? 'dist-e2e' : 'dist');
const alias = { '@': resolve(root, 'src') };
const define = { __BREWTAB_E2E__: JSON.stringify(e2e) };

const shared = {
  configFile: false,
  root,
  publicDir: false,
  resolve: { alias },
  define,
  logLevel: 'warn',
};

const pages = ['newtab', 'popup', 'settings', 'snappage', 'blocked'];

const contentScripts = {
  'content/nightshift': 'src/content/nightshift/index.ts',
  'content/reader': 'src/content/nightshift/reader.ts',
  'content/region': 'src/content/snappage/region.ts',
  'content/fullpage': 'src/content/snappage/fullpage.ts',
};

async function run() {
  if (existsSync(outDir) && !watch) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  await build({
    ...shared,
    plugins: [react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: false,
      target: 'chrome116',
      modulePreload: { polyfill: false },
      chunkSizeWarningLimit: 700,
      watch: watch ? {} : null,
      rollupOptions: {
        input: Object.fromEntries(pages.map((p) => [p, resolve(root, `${p}.html`)])),
      },
    },
  });

  await build({
    ...shared,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      watch: watch ? {} : null,
      lib: {
        entry: resolve(root, 'src/background/service-worker.ts'),
        formats: ['es'],
        fileName: () => 'service-worker.js',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });

  for (const [name, entry] of Object.entries(contentScripts)) {
    await build({
      ...shared,
      build: {
        outDir,
        emptyOutDir: false,
        target: 'chrome116',
        watch: watch ? {} : null,
        lib: { entry: resolve(root, entry), formats: ['iife'], name: 'BrewtabContent', fileName: () => `${name}.js` },
      },
    });
  }

  cpSync(resolve(root, 'public'), outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(createManifest({ e2e }), null, 2));
  console.log(`Built Brewtab${e2e ? ' (E2E)' : ''} → ${outDir}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
