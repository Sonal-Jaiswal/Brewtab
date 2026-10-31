// Optional permissions. Requested only from a user gesture, with an explanation
// shown in the UI first. Nothing here grants access at install time.

export const SITE_ACCESS: chrome.permissions.Permissions = { origins: ['*://*/*'] };
export const BOOKMARKS: chrome.permissions.Permissions = { permissions: ['bookmarks'] };

export interface PermissionInfo {
  id: 'site-access' | 'bookmarks';
  title: string;
  why: string;
  enables: string[];
  request: chrome.permissions.Permissions;
}

export const OPTIONAL_PERMISSIONS: PermissionInfo[] = [
  {
    id: 'site-access',
    title: 'Site access',
    why: 'Lets Brewtab read the address of the tab you are viewing. Nothing ever leaves your device.',
    enables: [
      'ScrollStop: show the friendly blocked page instead of Chrome’s error page',
      'ScrollStop: track time spent per website and enforce daily limits',
    ],
    request: SITE_ACCESS,
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    why: 'Read-only access so you can import bookmarks as shortcuts and browse folders on the dashboard.',
    enables: ['Import Chrome bookmarks', 'Bookmarks widget'],
    request: BOOKMARKS,
  },
];

export async function hasPermission(p: chrome.permissions.Permissions): Promise<boolean> {
  try {
    return await chrome.permissions.contains(p);
  } catch {
    return false;
  }
}

export const hasSiteAccess = () => hasPermission(SITE_ACCESS);

/** Must be called synchronously inside a click handler. */
export async function requestPermission(p: chrome.permissions.Permissions): Promise<boolean> {
  try {
    return await chrome.permissions.request(p);
  } catch {
    return false;
  }
}

export async function revokePermission(p: chrome.permissions.Permissions): Promise<boolean> {
  try {
    return await chrome.permissions.remove(p);
  } catch {
    return false;
  }
}
