// Cross-context change notifications for IndexedDB data (new tabs, popup,
// settings page and the service worker all share the same database).
export type DataTopic = 'tasks' | 'notes' | 'usage' | 'focusSessions' | 'dashboard' | 'captures' | 'wallpapers' | 'backups' | 'all';

const CHANNEL = 'brewtab-data';
let channel: BroadcastChannel | null = null;
const localListeners = new Set<(topic: DataTopic) => void>();

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e: MessageEvent<DataTopic>) => localListeners.forEach((l) => l(e.data));
  }
  return channel;
}

export function notifyChange(topic: DataTopic): void {
  // Same-context listeners first (BroadcastChannel doesn't echo to the sender).
  localListeners.forEach((l) => l(topic));
  getChannel()?.postMessage(topic);
}

export function onDataChange(cb: (topic: DataTopic) => void): () => void {
  getChannel();
  localListeners.add(cb);
  return () => localListeners.delete(cb);
}
