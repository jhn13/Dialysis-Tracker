// Small DOM helpers shared by every screen.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function svg(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; }

export const icons = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z"/><path d="M12 8v4l2.5 2.5"/></svg>',
  sessions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  bp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  supplies: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
  reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  face: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/></svg>',
};
export const icon = name => svg(icons[name]);

// ---------- sheets (full-height panels on phone, centred dialogs on wider screens) ----------
const stack = [];
export function openSheet({ title, body, footer, onClose, wide = false }) {
  const prevFocus = document.activeElement;
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('close'));
  const panel = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'sheet-head' }, h('h2', null, title), closeBtn),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('footer', { class: 'sheet-foot' }, footer) : null);
  const scrim = h('div', { class: 'scrim' }, panel);
  const api = {
    el: panel,
    close(result) {
      if (!scrim.isConnected) return;
      scrim.classList.add('leaving');
      setTimeout(() => scrim.remove(), 180);
      stack.splice(stack.indexOf(api), 1);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (onClose) onClose(result);
    },
  };
  closeBtn.addEventListener('click', () => api.close());
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) api.close(); });
  document.body.append(scrim);
  stack.push(api);
  requestAnimationFrame(() => {
    const first = panel.querySelector('[autofocus]') || closeBtn;
    first.focus({ preventScroll: true });
  });
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
export function closeAllSheets() { [...stack].reverse().forEach(s => s.close()); }

export function confirmBox({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const yes = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button' }, confirm);
    const no = h('button', { class: 'btn ghost', type: 'button' }, 'Cancel');
    const s = openSheet({ title, body: h('p', { class: 'lead' }, message), footer: [no, yes], onClose: () => { if (!done) resolve(false); } });
    yes.addEventListener('click', () => { done = true; s.close(); resolve(true); });
    no.addEventListener('click', () => s.close());
    s.el.classList.add('small');
  });
}

// Several choices; resolves with the chosen value, or null if closed.
export function choiceBox({ title, message, options }) {
  return new Promise(resolve => {
    let done = false;
    const btns = options.map(o => {
      const b = h('button', { type: 'button', class: 'btn block ' + (o.primary ? 'primary' : '') }, o.label);
      b.addEventListener('click', () => { done = true; s.close(); resolve(o.value); });
      return h('div', { class: 'choice' }, b, o.hint ? h('p', { class: 'hint' }, o.hint) : null);
    });
    const s = openSheet({ title, body: [h('p', { class: 'lead' }, message), ...btns], onClose: () => { if (!done) resolve(null); } });
    s.el.classList.add('small');
  });
}

let toastEl = null, toastTimer = null;
export function toast(msg) {
  if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---------- form bits ----------
export function field({ label, unit, input, hint, id }) {
  id = id || 'f-' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('div', { class: 'input-wrap' + (unit ? ' has-unit' : '') }, input, unit ? h('span', { class: 'unit', 'aria-hidden': 'true' }, unit) : null),
    hint ? h('p', { class: 'hint' }, hint) : null);
}

export function numberInput(value, { decimal = true, signed = false, placeholder = '' } = {}) {
  return h('input', {
    type: 'text', inputmode: signed ? 'text' : (decimal ? 'decimal' : 'numeric'),
    pattern: signed ? '-?[0-9]*[.,]?[0-9]*' : '[0-9]*[.,]?[0-9]*', autocomplete: 'off',
    value: value === null || value === undefined ? '' : String(value), placeholder,
  });
}
export const readNum = el => { const v = el.value.trim().replace(',', '.'); return v === '' || isNaN(+v) ? null : +v; };

// ---------- files ----------
export async function deliverFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = h('script', { src });
    s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  });
}
