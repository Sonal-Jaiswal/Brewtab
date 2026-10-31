import { useEffect, useState } from 'react';
import { Bookmark, ChevronLeft, Folder } from 'lucide-react';
import { usePermission } from '@/shared/hooks';
import { BOOKMARKS, requestPermission } from '@/shared/permissions';
import { Button, EmptyState, IconButton } from '@/shared/components/ui';
import { LinkAvatar } from '../components/LinkAvatar';
import type { WidgetProps } from './registry';

type Node = chrome.bookmarks.BookmarkTreeNode;

export default function BookmarksWidget({ instance, setWidgetSettings }: WidgetProps) {
  const [granted] = usePermission(BOOKMARKS);
  const [stack, setStack] = useState<Node[]>([]);
  const [children, setChildren] = useState<Node[]>([]);
  const folderId = (instance.settings.folderId as string | undefined) ?? '1'; // Bookmarks bar

  useEffect(() => {
    if (!granted) return;
    const id = stack.at(-1)?.id ?? folderId;
    chrome.bookmarks.getChildren(id).then(setChildren, () => setChildren([]));
  }, [granted, stack, folderId]);

  if (!granted) {
    return (
      <EmptyState icon={Bookmark} title="Show your bookmarks" action={<Button size="sm" variant="primary" onClick={() => void requestPermission(BOOKMARKS)}>Allow bookmarks access</Button>}>
        Read-only access to browse your Chrome bookmark folders here.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {stack.length > 0 && (
        <div className="mb-1 flex items-center gap-1 text-[12.5px]">
          <IconButton icon={ChevronLeft} label="Up one folder" size="sm" onClick={() => setStack((s) => s.slice(0, -1))} />
          <span className="truncate font-medium">{stack.at(-1)?.title}</span>
          <button className="ml-auto text-[11.5px] text-muted hover:text-accent" onClick={() => setWidgetSettings({ folderId: stack.at(-1)?.id })}>
            Pin as root
          </button>
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {children.map((n) =>
          n.url ? (
            <li key={n.id}>
              <a href={n.url} className="flex items-center gap-2 rounded-ctl px-1.5 py-1 text-[13px] hover:bg-subtle">
                <LinkAvatar title={n.title || n.url} url={n.url} icon={{ kind: 'letter' }} size={20} />
                <span className="truncate">{n.title || n.url}</span>
              </a>
            </li>
          ) : (
            <li key={n.id}>
              <button onClick={() => setStack((s) => [...s, n])} className="flex w-full items-center gap-2 rounded-ctl px-1.5 py-1 text-left text-[13px] hover:bg-subtle">
                <Folder size={16} className="text-accent" aria-hidden />
                <span className="truncate">{n.title}</span>
              </button>
            </li>
          ),
        )}
        {children.length === 0 && <EmptyState icon={Folder} title="This folder is empty" />}
      </ul>
    </div>
  );
}
