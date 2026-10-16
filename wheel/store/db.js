// IndexedDB（B.4）：DB `ploglin-wheel` v1 —— events / assets / meta。
// 不可用時（私密視窗、被封鎖）降級為記憶體模式；Node 測試也用記憶體實作。

const DB_NAME = 'ploglin-wheel';
const DB_VERSION = 1;

function reqP(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

export async function openIDB() {
  if (typeof indexedDB === 'undefined') throw new Error('no-idb');
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' }).createIndex('eventId', 'eventId');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('idb-blocked'));
  });
  const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);
  const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort')); });
  async function put(store, value) {
    const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(value); await done(t);
  }
  async function del(store, key) {
    const t = db.transaction(store, 'readwrite'); t.objectStore(store).delete(key); await done(t);
  }
  return {
    kind: 'idb',
    getAllEvents: () => reqP(tx('events').getAll()),
    getEvent: (id) => reqP(tx('events').get(id)).then(v => v || null),
    putEvent: (ev) => put('events', ev),
    deleteEvent: (id) => del('events', id),
    getMeta: (key) => reqP(tx('meta').get(key)).then(r => (r ? r.value : null)),
    putMeta: (key, value) => put('meta', { key, value }),
    deleteMeta: (key) => del('meta', key),
    listMeta: async (prefix) => (await reqP(tx('meta').getAll())).filter(r => r.key.startsWith(prefix)),
  };
}

/** 記憶體實作：與 IDB 同介面；存取時一律深拷貝，模擬「序列化落地」 */
export function createMemoryDB() {
  const events = new Map(), meta = new Map();
  const cp = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  return {
    kind: 'memory',
    _raw: { events, meta },
    async getAllEvents() { return [...events.values()].map(cp); },
    async getEvent(id) { return events.has(id) ? cp(events.get(id)) : null; },
    async putEvent(ev) { events.set(ev.id, cp(ev)); },
    async deleteEvent(id) { events.delete(id); },
    async getMeta(key) { return meta.has(key) ? cp(meta.get(key)) : null; },
    async putMeta(key, value) { meta.set(key, cp(value)); },
    async deleteMeta(key) { meta.delete(key); },
    async listMeta(prefix) { return [...meta.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: cp(value) })); },
  };
}

export async function openDB() {
  try { return await openIDB(); }
  catch (e) { const m = createMemoryDB(); m.degraded = true; m.error = String(e && e.message || e); return m; }
}
