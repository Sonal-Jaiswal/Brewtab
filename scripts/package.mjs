// Packages dist/ into a Chrome Web Store ZIP after sanity-checking the build.
// Usage: npm run package
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

const problems = [];
if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
if (manifest.host_permissions) problems.push('release build must not declare host_permissions (E2E build packaged by mistake?)');
if (/E2E/.test(manifest.name)) problems.push('manifest name says E2E');
for (const size of [16, 32, 48, 128]) if (!existsSync(join(dist, `icons/icon-${size}.png`))) problems.push(`missing icon ${size}`);

const files = [];
const walk = (dir) => readdirSync(dir).forEach((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : files.push(join(dir, f))));
walk(dist);
for (const f of files.filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  if (src.includes('brewtabTest')) problems.push(`test hooks present in ${f}`);
  if (/\beval\(|new Function\(/.test(src)) problems.push(`dynamic code evaluation in ${f}`);
  if (/<script[^>]+src=["']https?:/i.test(src)) problems.push(`remote script reference in ${f}`);
}
for (const f of files.filter((f) => f.endsWith('.html'))) {
  if (/src=["']https?:\/\//i.test(readFileSync(f, 'utf8'))) problems.push(`remote resource in ${f}`);
}
if (problems.length) {
  console.error('Packaging aborted:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const outDir = join(root, 'release');
mkdirSync(outDir, { recursive: true });
const zip = join(outDir, `brewtab-${manifest.version}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: dist });
const size = statSync(zip).size;
console.log(`Packaged ${files.length} files → ${zip} (${(size / 1024).toFixed(0)} KB)`);
