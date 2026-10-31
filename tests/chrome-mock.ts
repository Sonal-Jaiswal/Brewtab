// Minimal in-memory implementation of the chrome.* APIs used by Brewtab, for unit tests.
type Listener<A extends unknown[]> = (...args: A) => void;

function event<A extends unknown[]>() {
  const listeners = new Set<Listener<A>>();
  return {
    addListener: (l: Listener<A>) => listeners.add(l),
    removeListener: (l: Listener<A>) => listeners.delete(l),
    hasListener: (l: Listener<A>) => listeners.has(l),
    emit: (...args: A) => listeners.forEach((l) => l(...args)),
    clear: () => listeners.clear(),
  };
}

function storageArea(name: string, onChanged: ReturnType<typeof event<[Record<string, chrome.storage.StorageChange>, string]>>) {
  let data: Record<string, unknown> = {};
  const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  return {
    async get(keys?: string | string[] | null) {
      if (keys == null) return clone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, clone(data[k])]));
    },
    async set(items: Record<string, unknown>) {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
        data[k] = clone(v);
      }
      onChanged.emit(changes, name);
    },
    async remove(keys: string | string[]) {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (k in data) changes[k] = { oldValue: data[k] };
        delete data[k];
      }
      onChanged.emit(changes, name);
    },
    async clear() {
      const changes = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { oldValue: v }]));
      data = {};
      onChanged.emit(changes, name);
    },
    _dump: () => data,
  };
}

export function createChromeMock() {
  const onChanged = event<[Record<string, chrome.storage.StorageChange>, string]>();
  let dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  const granted = { permissions: new Set<string>(), origins: new Set<string>() };
  const alarms = new Map<string, chrome.alarms.Alarm>();
  const registered: chrome.scripting.RegisteredContentScript[] = [];

  const mock = {
    storage: {
      local: storageArea('local', onChanged),
      session: storageArea('session', onChanged),
      onChanged,
    },
    runtime: {
      id: 'test-extension-id',
      getManifest: () => ({ version: '1.0.0', name: 'Brewtab' }),
      getURL: (p: string) => `chrome-extension://test-extension-id/${p.replace(/^\//, '')}`,
      sendMessage: async () => undefined,
      onMessage: event(),
      lastError: undefined,
    },
    declarativeNetRequest: {
      getDynamicRules: async () => structuredClone(dynamicRules),
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }: chrome.declarativeNetRequest.UpdateRuleOptions) => {
        dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id));
        const ids = new Set(dynamicRules.map((r) => r.id));
        for (const r of addRules) {
          if (ids.has(r.id)) throw new Error(`Rule with id ${r.id} already exists`);
          ids.add(r.id);
        }
        dynamicRules.push(...structuredClone(addRules));
      },
    },
    permissions: {
      contains: async (p: chrome.permissions.Permissions) =>
        (p.permissions ?? []).every((x) => granted.permissions.has(x)) && (p.origins ?? []).every((x) => granted.origins.has(x)),
      request: async (p: chrome.permissions.Permissions) => {
        p.permissions?.forEach((x) => granted.permissions.add(x));
        p.origins?.forEach((x) => granted.origins.add(x));
        return true;
      },
      remove: async (p: chrome.permissions.Permissions) => {
        p.permissions?.forEach((x) => granted.permissions.delete(x));
        p.origins?.forEach((x) => granted.origins.delete(x));
        return true;
      },
      onAdded: event(),
      onRemoved: event(),
    },
    alarms: {
      create: async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
        alarms.set(name, { name, scheduledTime: info.when ?? Date.now() + (info.delayInMinutes ?? 0) * 60000, periodInMinutes: info.periodInMinutes } as chrome.alarms.Alarm);
      },
      get: async (name: string) => alarms.get(name),
      getAll: async () => [...alarms.values()],
      clear: async (name: string) => alarms.delete(name),
      onAlarm: event(),
    },
    scripting: {
      getRegisteredContentScripts: async () => structuredClone(registered),
      registerContentScripts: async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        registered.push(...scripts);
      },
      unregisterContentScripts: async (filter?: { ids?: string[] }) => {
        for (let i = registered.length - 1; i >= 0; i--) if (!filter?.ids || filter.ids.includes(registered[i].id)) registered.splice(i, 1);
      },
    },
    action: { setBadgeText: async () => undefined, setBadgeBackgroundColor: async () => undefined },
    _granted: granted,
    _alarms: alarms,
    _registered: registered,
  };
  return mock;
}

export type ChromeMock = ReturnType<typeof createChromeMock>;
