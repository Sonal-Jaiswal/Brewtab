// Pure operations for shortcuts and shortcut folders.
import type { LinkFolder, QuickLink, QuickLinksDoc } from '@/shared/types';
import { uid } from '@/shared/utils';
import { canonicalUrl, ensureUrl } from '@/shared/utils/url';

export type LinksState = Omit<QuickLinksDoc, 'id'>;

export const EMPTY_LINKS: LinksState = { links: [], folders: [] };

export function findDuplicate(state: LinksState, url: string, ignoreId?: string): QuickLink | undefined {
  const c = canonicalUrl(url);
  return state.links.find((l) => l.id !== ignoreId && canonicalUrl(l.url) === c);
}

export type LinkInput = Pick<QuickLink, 'title' | 'url'> & Partial<Pick<QuickLink, 'icon' | 'folderId' | 'category'>>;

export function addLink(state: LinksState, input: LinkInput): { state: LinksState; link: QuickLink } {
  const url = ensureUrl(input.url);
  if (!url) throw new Error('Enter a valid web address');
  const link: QuickLink = {
    id: uid('l_'),
    title: input.title.trim() || titleFromUrl(url),
    url,
    icon: input.icon ?? { kind: 'letter' },
    folderId: input.folderId ?? null,
    category: input.category?.trim() ?? '',
    createdAt: Date.now(),
  };
  return { state: { ...state, links: [...state.links, link] }, link };
}

export function updateLink(state: LinksState, id: string, patch: Partial<LinkInput>): LinksState {
  return {
    ...state,
    links: state.links.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (patch.url !== undefined) {
        const url = ensureUrl(patch.url);
        if (!url) throw new Error('Enter a valid web address');
        next.url = url;
      }
      if (patch.title !== undefined) next.title = patch.title.trim() || titleFromUrl(next.url);
      return next;
    }),
  };
}

export function removeLink(state: LinksState, id: string): LinksState {
  return { ...state, links: state.links.filter((l) => l.id !== id) };
}

export function moveLink(state: LinksState, fromId: string, toId: string): LinksState {
  const from = state.links.findIndex((l) => l.id === fromId);
  const to = state.links.findIndex((l) => l.id === toId);
  if (from < 0 || to < 0 || from === to) return state;
  const links = [...state.links];
  const [item] = links.splice(from, 1);
  links.splice(to, 0, item);
  return { ...state, links };
}

export function addFolder(state: LinksState, name: string): { state: LinksState; folder: LinkFolder } {
  const folder = { id: uid('f_'), name: name.trim() || 'New folder' };
  return { state: { ...state, folders: [...state.folders, folder] }, folder };
}

export function renameFolder(state: LinksState, id: string, name: string): LinksState {
  return { ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) };
}

/** Removing a folder keeps its shortcuts (moved to "All"). */
export function removeFolder(state: LinksState, id: string): LinksState {
  return {
    folders: state.folders.filter((f) => f.id !== id),
    links: state.links.map((l) => (l.folderId === id ? { ...l, folderId: null } : l)),
  };
}

export function titleFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.').slice(-2, -1)[0] ?? host;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

export interface BookmarkSource {
  title: string;
  url?: string;
  children?: BookmarkSource[];
}

/**
 * Import selected Chrome bookmark folders. Each folder becomes a shortcut
 * folder; nested bookmarks are flattened into it. Duplicates are skipped.
 */
export function importBookmarkFolders(state: LinksState, folders: BookmarkSource[]): { state: LinksState; added: number; skipped: number } {
  let next = state;
  let added = 0;
  let skipped = 0;
  for (const f of folders) {
    const urls: { title: string; url: string }[] = [];
    const walk = (n: BookmarkSource) => {
      if (n.url) urls.push({ title: n.title, url: n.url });
      n.children?.forEach(walk);
    };
    walk(f);
    if (!urls.length) continue;
    let folder = next.folders.find((x) => x.name === f.title);
    if (!folder) ({ state: next, folder } = addFolder(next, f.title));
    for (const u of urls) {
      if (!/^https?:/i.test(u.url) || findDuplicate(next, u.url)) {
        skipped++;
        continue;
      }
      next = addLink(next, { title: u.title, url: u.url, folderId: folder.id }).state;
      added++;
    }
  }
  return { state: next, added, skipped };
}

export const SUGGESTED_SITES: { title: string; url: string }[] = [
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Calendar', url: 'https://calendar.google.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { title: 'Drive', url: 'https://drive.google.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' },
  { title: 'LinkedIn', url: 'https://www.linkedin.com' },
  { title: 'Notion', url: 'https://www.notion.so' },
  { title: 'Figma', url: 'https://www.figma.com' },
];
