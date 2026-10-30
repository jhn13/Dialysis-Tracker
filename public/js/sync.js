// Sign-in and sync with Supabase. The app always works from the local copy;
// this sends changes up and brings changes from other devices down.
import * as db from './db.js';

const cfg = window.DT_CONFIG || {};
export const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

let client = null;
export const state = { user: null, status: configured ? 'signed_out' : 'local', lastSync: null, error: '' };
const listeners = new Set();
export function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function set(patch) { Object.assign(state, patch); listeners.forEach(fn => fn(state)); }

let timer = null;
let running = null;

export async function init() {
  if (!configured) return;
  client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dt-auth' },
  });
  const { data } = await client.auth.getSession();
  state.lastSync = await db.getMeta('lastSyncAt');
  if (data.session) set({ user: data.session.user, status: 'idle' });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    const user = session ? session.user : null;
    if ((user && user.id) !== (state.user && state.user.id)) set({ user, status: user ? 'idle' : 'signed_out' });
  });
  db.onChange(src => { if (src === 'local') schedule(); });
  window.addEventListener('online', () => schedule(200));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);
  if (state.user) schedule(0);
}

export function schedule(ms = 1500) {
  if (!client || !state.user) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const owner = await db.getMeta('ownerId');
  if (owner && owner !== data.user.id) {
    // Someone else's data is on this device: clear it before loading this account.
    await db.wipe();
  }
  await db.setMeta('ownerId', data.user.id);
  set({ user: data.user, status: 'idle' });
  await syncNow();
  return data.user;
}

export async function sendReset(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
  set({ recovery: false });
}

// Check the password again without signing out (used when Face ID isn't available).
export async function checkPassword(password) {
  const { error } = await client.auth.signInWithPassword({ email: state.user.email, password });
  if (error) throw error;
}

export async function signOut({ removeData = true } = {}) {
  try { await syncNow(); } catch (e) {}
  await client.auth.signOut();
  if (removeData) await db.wipe();
  set({ user: null, status: 'signed_out', lastSync: null });
}

export function syncNow() {
  if (!client || !state.user) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) { set({ status: 'offline' }); return; }
    set({ status: 'syncing', error: '' });
    try {
      // 1. Send local changes.
      const dirty = db.dirtyRecords();
      for (let i = 0; i < dirty.length; i += 200) {
        const chunk = dirty.slice(i, i + 200);
        const rows = chunk.map(r => ({ user_id: state.user.id, id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at, deleted: !!r.deleted }));
        const { error } = await client.from('records').upsert(rows, { onConflict: 'user_id,id' });
        if (error) throw error;
        await db.markClean(chunk);
      }
      // 2. Fetch changes made elsewhere (with a small overlap, duplicates are harmless).
      let since = (await db.getMeta('lastPull')) || '1970-01-01T00:00:00Z';
      since = new Date(new Date(since).getTime() - 5000).toISOString();
      let newest = null;
      for (;;) {
        const { data, error } = await client.from('records')
          .select('id,kind,data,updated_at,deleted,synced_at')
          .gt('synced_at', since).order('synced_at', { ascending: true }).limit(1000);
        if (error) throw error;
        if (!data.length) break;
        await db.applyIncoming(data);
        newest = data[data.length - 1].synced_at;
        since = newest;
        if (data.length < 1000) break;
      }
      if (newest) await db.setMeta('lastPull', newest);
      const at = new Date().toISOString();
      await db.setMeta('lastSyncAt', at);
      set({ status: 'idle', lastSync: at });
    } catch (e) {
      console.error(e);
      const offline = !navigator.onLine || /fetch|network/i.test(e.message || '');
      set({ status: offline ? 'offline' : 'error', error: e.message || String(e) });
    }
  })().finally(() => { running = null; if (db.dirtyRecords().length && state.status === 'idle') schedule(); });
  return running;
}

export const pending = () => db.dirtyRecords().length;
