// Light, dark or follow the device. Saved on this device only.
const KEY = 'dt-theme';
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set();

export function choice() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; }
}
export function resolved() {
  const c = choice();
  return c === 'system' ? (media && media.matches ? 'dark' : 'light') : c;
}
export function apply() {
  const t = resolved();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#11171E' : '#ECF0EF');
  listeners.forEach(fn => fn(t));
}
export function set(c) {
  try { if (c === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch (e) {}
  apply();
}
export function toggle() { set(resolved() === 'dark' ? 'light' : 'dark'); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
if (media) (media.addEventListener ? media.addEventListener('change', () => { if (choice() === 'system') apply(); }) : media.addListener(() => { if (choice() === 'system') apply(); }));
