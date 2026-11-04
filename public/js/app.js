import { h, icon, svg, field, toast, closeAllSheets } from './ui.js';
import * as db from './db.js';
import * as sync from './sync.js';
import * as lock from './lock.js';
import * as today from './views/today.js';
import * as sessions from './views/sessions.js';
import * as supplies from './views/supplies.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';
import { startSetup } from './views/onboarding.js';
import { renderSharedPage } from './views/share.js';
import * as M from './model.js';
import * as theme from './theme.js';

const ROUTES = {
  today: { title: 'Today', view: today, tab: true, label: 'Today' },
  sessions: { title: 'Sessions', view: sessions, tab: true, label: 'Sessions' },
  supplies: { title: 'Supplies', view: supplies, tab: true, label: 'Supplies' },
  reports: { title: 'Reports', view: reports, tab: true, label: 'Reports' },
  settings: { title: 'Settings', view: settings },
};

const MARK = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#1B2430"/><path d="M14 31c0-9 5-16 10-16s10 7 10 16" fill="none" stroke="#C8322F" stroke-width="4.5" stroke-linecap="round"/><path d="M34 31c0 4-4.5 6-10 6s-10-2-10-6" fill="none" stroke="#5B8FD8" stroke-width="4.5" stroke-linecap="round"/></svg>';

const root = document.getElementById('root');
let route = 'today';
let mainEl, titleEl, syncBtn, tabsEl;
let pendingRender = false;
let hiddenAt = null;
const LOCK_AFTER_MS = 5 * 60 * 1000;

function go(name) {
  if (name === 'signin') { showSignIn(); return; }
  location.hash = '#' + name;
}

function currentRoute() {
  const r = (location.hash || '#today').slice(1).split('?')[0];
  return ROUTES[r] ? r : 'today';
}

function syncLabel() {
  const s = sync.state;
  if (s.status === 'local') return 'On this device';
  if (s.status === 'syncing') return 'Syncing';
  if (s.status === 'offline') return 'Offline';
  if (s.status === 'error') return 'Sync problem';
  if (s.status === 'signed_out') return 'Signed out';
  return sync.pending() ? 'Saving' : 'Synced';
}
function drawSync() {
  if (!syncBtn) return;
  syncBtn.dataset.s = sync.state.status;
  syncBtn.querySelector('.txt').textContent = syncLabel();
}

function buildShell() {
  titleEl = h('h1');
  syncBtn = h('button', { type: 'button', class: 'sync', title: 'Sync status', onclick: () => { if (sync.state.user) sync.syncNow(); else go('settings'); } }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'txt' }));
  const gear = h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings' }, icon('settings'));
  const themeBtn = h('button', { type: 'button', class: 'icon-btn theme-btn' });
  const drawTheme = () => {
    const dark = theme.resolved() === 'dark';
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.title = themeBtn.getAttribute('aria-label');
  };
  themeBtn.addEventListener('click', () => theme.toggle());
  theme.onChange(drawTheme); drawTheme();
  mainEl = h('main', { id: 'main', tabindex: '-1' });
  tabsEl = h('nav', { class: 'tabs', 'aria-label': 'Main' },
    Object.entries(ROUTES).filter(([, r]) => r.tab).map(([k, r]) => h('a', { class: 'tab', href: '#' + k, 'data-r': k }, icon(k), h('span', null, r.label))));
  root.replaceChildren(
    h('div', { class: 'brand-side' }, svg(MARK), 'Dialysis Tracker'),
    h('div', { class: 'app' }, h('header', { class: 'topbar' }, titleEl, syncBtn, themeBtn, gear), mainEl),
    tabsEl);
  drawSync();
}

async function render() {
  route = currentRoute();
  const r = ROUTES[route];
  titleEl.textContent = r.title;
  document.title = `${r.title} – Dialysis Tracker`;
  tabsEl.querySelectorAll('.tab').forEach(t => { if (t.dataset.r === route) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  await r.view.render(mainEl, { go });
  pendingRender = false;
}

function rerenderSoon() {
  const a = document.activeElement;
  if (a && mainEl && mainEl.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { pendingRender = true; return; }
  render();
}

// ---------- gates ----------
function gate(...kids) {
  root.replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'gate-card' }, svg(MARK), ...kids)));
  const m = root.querySelector('.gate-card > svg'); if (m) m.classList.add('mark');
}

function showSignIn() {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, autofocus: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'btn primary block' }, 'Sign in');
  const form = h('form', { class: 'form' }, field({ label: 'Email', input: email }), field({ label: 'Password', input: pw }), err, btn);
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in';
    try { await sync.signIn(email.value.trim(), pw.value); start(); }
    catch (ex) { err.textContent = /invalid/i.test(ex.message) ? 'That email and password don’t match an account.' : (navigator.onLine ? ex.message : 'You’re offline. Connect to the internet to sign in.'); btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  const forgot = h('button', { type: 'button', class: 'btn ghost', style: { justifySelf: 'start', paddingLeft: 0 } }, 'Forgot password?');
  forgot.addEventListener('click', async () => {
    if (!email.value.trim()) { err.textContent = 'Enter your email first, then tap Forgot password.'; return; }
    try { await sync.sendReset(email.value.trim()); toast('Check your email for a reset link'); } catch (ex) { err.textContent = ex.message; }
  });
  gate(h('h1', null, 'Dialysis Tracker'), h('p', { class: 'lead' }, 'Sign in to see your sessions and supplies. New here? You’ll be taken through a short setup after signing in.'), form, forgot);
  setTimeout(() => email.focus(), 50);
}

function showNewPassword() {
  const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, autofocus: true });
  const err = h('p', { class: 'err', role: 'alert' });
  const form = h('form', { class: 'form' }, field({ label: 'New password', input: pw, hint: 'At least 8 characters.' }), err, h('button', { type: 'submit', class: 'btn primary block' }, 'Save password'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (pw.value.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
    try { await sync.updatePassword(pw.value); toast('Password saved'); history.replaceState(null, '', '/#today'); start(); } catch (ex) { err.textContent = ex.message; }
  });
  gate(h('h1', null, 'Choose a new password'), form);
}

let unlocking = false;
function showLock() {
  closeAllSheets();
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { type: 'button', class: 'btn primary block' }, icon('face'), 'Unlock');
  btn.addEventListener('click', async () => {
    if (unlocking) return; unlocking = true; err.textContent = '';
    try { await lock.unlock(); unlocked(); }
    catch (e) { err.textContent = 'Not unlocked. Try again, or use your password.'; }
    finally { unlocking = false; }
  });
  const usePw = h('button', { type: 'button', class: 'btn ghost' }, 'Use password instead');
  usePw.addEventListener('click', () => {
    const pw = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true });
    const form = h('form', { class: 'form' }, field({ label: 'Password for ' + sync.state.user.email, input: pw }), err, h('button', { type: 'submit', class: 'btn primary block' }, 'Unlock'));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!navigator.onLine) { err.textContent = 'You’re offline, so the password can’t be checked. Use Face ID instead.'; return; }
      try { await sync.checkPassword(pw.value); unlocked(); } catch (ex) { err.textContent = 'That password isn’t right.'; }
    });
    gate(h('h1', null, 'Locked'), form);
    setTimeout(() => pw.focus(), 50);
  });
  gate(h('h1', null, 'Locked'), h('p', { class: 'lead' }, 'Your records are locked on this device.'), btn, err, usePw);
}
function unlocked() { if (M.needsSetup()) { start(); return; } buildShell(); render(); }

// ---------- start ----------
async function start() {
  if (sync.configured && sync.state.recovery) { showNewPassword(); return; }
  if (sync.configured && !sync.state.user) { showSignIn(); return; }
  if (sync.state.user && await lock.enabledHere()) { showLock(); return; }
  if (M.needsSetup()) { startSetup(root, { mark: MARK, onDone: () => { history.replaceState(null, '', '/#today'); buildShell(); render(); } }); return; }
  buildShell();
  await render();
}

async function boot() {
  theme.apply();
  theme.onChange(() => { if (mainEl && mainEl.isConnected && currentRoute() === 'settings') render(); });
  if (location.pathname.replace(/\/$/, '') === '/share') {
    // Someone opening a share link: show the records only. No sign-in, nothing saved on their device.
    document.getElementById('boot').remove();
    await renderSharedPage(root, MARK);
    return;
  }
  await db.load();
  await sync.init();
  db.onChange(() => { drawSync(); if (mainEl && mainEl.isConnected) rerenderSoon(); });
  sync.onState(s => {
    drawSync();
    if (s.recovery && root.querySelector('.gate') === null) showNewPassword();
  });
  window.addEventListener('hashchange', () => { if (mainEl && mainEl.isConnected) { render(); window.scrollTo(0, 0); } });
  document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) rerenderSoon(); }, 0));
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && sync.state.user && await lock.enabledHere()) showLock();
    hiddenAt = null;
    if (mainEl && mainEl.isConnected) rerenderSoon(); // the date may have changed
  });
  document.getElementById('boot').remove();
  await start();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot().catch(e => {
  console.error(e);
  document.getElementById('root').replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'gate-card' }, h('h1', null, 'The app couldn’t start'), h('p', { class: 'lead' }, e.message || String(e)))));
});
