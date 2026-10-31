// Generates the Manifest V3 file. Kept in code so the E2E build can extend
// host permissions for the local test server without touching the release manifest.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** @param {{ e2e?: boolean }} options */
export function createManifest({ e2e = false } = {}) {
  /** @type {Record<string, unknown>} */
  const manifest = {
    manifest_version: 3,
    name: 'Brewtab — Start every tab fresh',
    short_name: 'Brewtab',
    version: pkg.version,
    description:
      'A calm, customisable new-tab dashboard with tasks, notes, focus blocking, site appearance controls and screenshots. Local-only.',
    minimum_chrome_version: '116',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    chrome_url_overrides: { newtab: 'newtab.html' },
    options_page: 'settings.html',
    action: {
      default_popup: 'popup.html',
      default_title: 'Brewtab',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' },
    },
    background: { service_worker: 'service-worker.js', type: 'module' },
    permissions: ['storage', 'alarms', 'declarativeNetRequest', 'activeTab', 'scripting', 'contextMenus', 'idle', 'notifications', 'search'],
    optional_permissions: ['bookmarks'],
    optional_host_permissions: ['*://*/*'],
    commands: {
      'snap-visible': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'SnapPage: capture the visible area',
      },
      'snap-region': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'SnapPage: capture a selected region',
      },
    },
    web_accessible_resources: [],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; img-src 'self' data: blob:",
    },
  };

  if (e2e) {
    // E2E only: grant access to the local fixture server so tests can exercise
    // redirect rules, usage tracking and NightShift without a permission dialog.
    // <all_urls> stands in for the activeTab grant that a real toolbar click gives
    // captureVisibleTab, which automated tests cannot perform.
    manifest.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*', '<all_urls>'];
    manifest.name = 'Brewtab (E2E build)';
  }
  return manifest;
}
