// Local store. Every record lives in IndexedDB on this device first, so the app works offline.
// Shape of a record: { id, kind, data, updated_at, deleted, dirty }
// "dirty" means the change hasn't been sent to Supabase yet.

const DB_NAME = 'dialysis-tracker';
const DB_VERSION = 1;
let dbp = null;
let cache = new Map();        // id -> record (all records, including deleted ones)
const listeners = new Set();

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function load() {
  const all = await tx('records', 'readonly', s => s.getAll());
  cache = new Map(all.map(r => [r.id, r]));
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(source) { listeners.forEach(fn => { try { fn(source); } catch (e) { console.error(e); } }); }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// All live records of one kind.
export function list(kind) {
  const out = [];
  for (const r of cache.values()) if (r.kind === kind && !r.deleted) out.push({ id: r.id, ...r.data });
  return out;
}

export function get(id) {
  const r = cache.get(id);
  return r && !r.deleted ? { id: r.id, ...r.data } : null;
}

// Save one or many items: put(kind, obj) where obj.id is optional.
export async function put(kind, obj) {
  const items = Array.isArray(obj) ? obj : [obj];
  const now = new Date().toISOString();
  const recs = items.map(o => {
    const { id, ...data } = o;
    return { id: id || uid(), kind, data, updated_at: now, deleted: false, dirty: true };
  });
  await tx('records', 'readwrite', s => recs.forEach(r => s.put(r)));
  recs.forEach(r => cache.set(r.id, r));
  emit('local');
  return Array.isArray(obj) ? recs.map(r => r.id) : recs[0].id;
}

export async function remove(ids) {
  ids = Array.isArray(ids) ? ids : [ids];
  const now = new Date().toISOString();
  const recs = ids.map(id => cache.get(id)).filter(Boolean).map(r => ({ ...r, deleted: true, updated_at: now, dirty: true }));
  await tx('records', 'readwrite', s => recs.forEach(r => s.put(r)));
  recs.forEach(r => cache.set(r.id, r));
  emit('local');
}

// ---- used by sync ----
export function dirtyRecords() { return [...cache.values()].filter(r => r.dirty); }

export async function markClean(sent) {
  // Only clear the flag if the record hasn't changed again since it was sent.
  const recs = [];
  for (const s of sent) {
    const cur = cache.get(s.id);
    if (cur && cur.updated_at === s.updated_at && cur.dirty) recs.push({ ...cur, dirty: false });
  }
  if (!recs.length) return;
  await tx('records', 'readwrite', s => recs.forEach(r => s.put(r)));
  recs.forEach(r => cache.set(r.id, r));
}

// Apply records that came from the server (or a backup file). Newer wins.
export async function applyIncoming(rows, { markDirty = false } = {}) {
  const recs = [];
  for (const row of rows) {
    const cur = cache.get(row.id);
    if (cur && cur.dirty && cur.updated_at > row.updated_at) continue;
    if (cur && !cur.dirty && cur.updated_at >= row.updated_at && !markDirty) continue;
    if (cur && markDirty && cur.updated_at >= row.updated_at) continue;
    recs.push({ id: row.id, kind: row.kind, data: row.data, updated_at: row.updated_at, deleted: !!row.deleted, dirty: markDirty });
  }
  if (!recs.length) return 0;
  await tx('records', 'readwrite', s => recs.forEach(r => s.put(r)));
  recs.forEach(r => cache.set(r.id, r));
  emit('remote');
  return recs.length;
}

export function allRecords() { return [...cache.values()]; }

export async function wipe() {
  await tx('records', 'readwrite', s => s.clear());
  await tx('meta', 'readwrite', s => s.clear());
  cache = new Map();
  emit('local');
}

export function getMeta(key) { return tx('meta', 'readonly', s => s.get(key)); }
export function setMeta(key, value) { return tx('meta', 'readwrite', s => s.put(value, key)); }
