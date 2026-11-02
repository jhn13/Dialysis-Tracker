// Share links: a private web address that shows your completed sessions for one date range.
import { h, openSheet, field, toast, confirmBox, svg } from '../ui.js';
import * as M from '../model.js';
import * as sync from '../sync.js';
import * as X from '../export.js';
import { reportContent, rangeLabel } from './reports.js';

const expiryText = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function shareUrl(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { toast('Couldn’t copy. Press and hold the link to copy it.'); }
}

export function openShareSheet({ from, to, count, onCreated }) {
  const rangeText = rangeLabel(from, to);
  if (!sync.state.user) { toast('Sign in to create share links'); return; }
  const label = h('input', { type: 'text', placeholder: 'For example Renal unit', autocomplete: 'off' });
  const expiry = h('select', null,
    h('option', { value: '7' }, '7 days'), h('option', { value: '30' }, '30 days'), h('option', { value: '90' }, '90 days'));
  expiry.value = '30';
  const err = h('p', { class: 'err', role: 'alert' });
  const body = h('div', { class: 'form' },
    h('p', { class: 'lead' }, `Anyone with the link can see your ${count} completed session${count === 1 ? '' : 's'} from ${rangeText}, including notes, and download them. They don’t need an account.`),
    h('div', { class: 'grid2' }, field({ label: 'Who it’s for', input: label, hint: 'Only you see this.' }), field({ label: 'Link works for', input: expiry })),
    h('p', { class: 'hint' }, 'Edits you make to these sessions show on the link. You can stop a link at any time from Reports.'),
    err);
  const btn = h('button', { type: 'button', class: 'btn primary' }, 'Create link');
  btn.addEventListener('click', async () => {
    btn.disabled = true; err.textContent = '';
    try {
      const share = await sync.createShare({ from, to, days: +expiry.value, label: label.value.trim() });
      sheet.close();
      showLink(share, rangeText);
      if (onCreated) onCreated();
    } catch (e) {
      err.textContent = navigator.onLine ? e.message : 'You’re offline. Connect to the internet to create a link.';
      btn.disabled = false;
    }
  });
  const sheet = openSheet({ title: 'Share link', body, footer: [btn] });
}

function showLink(share, rangeText) {
  const box = h('input', { type: 'text', value: share.url, readonly: true, class: 'input', 'aria-label': 'Share link' });
  box.addEventListener('focus', () => box.select());
  const btn = h('button', { type: 'button', class: 'btn primary' }, navigator.share ? 'Share link' : 'Copy link');
  btn.addEventListener('click', () => shareUrl(share.url, `Dialysis records, ${rangeText}`));
  openSheet({
    title: 'Link ready',
    body: h('div', { class: 'form' },
      h('p', { class: 'lead' }, `${rangeText}. Works until ${expiryText(share.expires_at)}.`),
      box,
      h('p', { class: 'hint' }, 'Send it by email or message to your team. Treat it like your records: anyone who has it can open it.')),
    footer: [btn],
  });
}

export async function sharedLinks() {
  let links;
  try { links = await sync.listShares(); } catch (e) { return null; }
  if (!links.length) return null;
  const wrap = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Your share links')),
    h('div', { class: 'panel rows' }, links.map(l => {
      const stop = h('button', { type: 'button', class: 'btn small ghost', style: { color: 'var(--art)' } }, 'Stop');
      stop.addEventListener('click', async () => {
        if (!(await confirmBox({ title: 'Stop this link?', message: 'Anyone who opens it will see that it no longer works. You can make a new one at any time.', confirm: 'Stop link', danger: true }))) return;
        try { await sync.revokeShare(l.token); toast('Link stopped'); row.remove(); } catch (e) { toast(e.message); }
      });
      const send = h('button', { type: 'button', class: 'btn small' }, 'Send');
      send.addEventListener('click', () => shareUrl(l.url, `Dialysis records, ${rangeLabel(l.date_from, l.date_to)}`));
      const row = h('div', { class: 'row link-row', style: { cursor: 'default' } },
        h('span', { class: 't' }, l.label || rangeLabel(l.date_from, l.date_to)),
        h('span', { class: 's' }, [l.label ? rangeLabel(l.date_from, l.date_to) : null, `until ${expiryText(l.expires_at)}`, l.views ? `opened ${l.views} time${l.views === 1 ? '' : 's'}` : 'not opened yet'].filter(Boolean).join(', ')),
        h('span', { class: 'v' }, h('span', { class: 'btn-row' }, send, stop)));
      return row;
    })));
  return wrap;
}

// ---------- the public page someone opens from a link ----------
export async function renderSharedPage(root, mark) {
  const tok = location.hash.slice(1);
  document.title = 'Dialysis records';
  const shell = (...kids) => root.replaceChildren(h('div', { class: 'shared' },
    h('header', { class: 'shared-head' }, svg(mark), h('span', null, 'Dialysis Tracker')),
    h('main', null, ...kids)));
  shell(h('p', { class: 'lead' }, 'Loading records…'));
  let data;
  try { data = tok ? await sync.fetchShare(tok) : null; } catch (e) {
    shell(h('h1', null, 'These records couldn’t load'), h('p', { class: 'lead' }, navigator.onLine ? 'Something went wrong. Try opening the link again.' : 'You’re offline. Connect to the internet and open the link again.'));
    return;
  }
  if (!data) {
    shell(h('h1', null, 'This link no longer works'), h('p', { class: 'lead' }, 'It may have expired or been stopped by the person who shared it. Ask them to send a new link.'));
    return;
  }
  const sessions = data.sessions || [];
  const st = { name: data.name, hidden: data.hidden || {} };
  const rangeText = rangeLabel(data.from, data.to);
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { toast('Couldn’t create the file. Try again.'); } finally { btn.disabled = false; } };
  const excel = h('button', { type: 'button', class: 'btn primary' }, 'Download Excel');
  excel.addEventListener('click', () => busy(excel, () => X.downloadExcel(sessions, [], data.from, data.to, st)));
  const csv = h('button', { type: 'button', class: 'btn' }, 'Download CSV');
  csv.addEventListener('click', () => busy(csv, () => X.downloadCSV('sessions', sessions, [], data.from, data.to, st)));
  const pdf = h('button', { type: 'button', class: 'btn' }, 'Print or save as PDF');
  pdf.addEventListener('click', () => window.print());
  document.title = `Dialysis records${data.name ? ' for ' + data.name : ''}`;
  shell(
    h('div', { class: 'section' },
      h('h1', null, `Dialysis records${data.name ? ' for ' + data.name : ''}`),
      h('p', { class: 'lead' }, `${rangeText}: ${sessions.length} completed session${sessions.length === 1 ? '' : 's'}.`),
      h('p', { class: 'hint' }, `Shared on ${expiryText(data.created_at)}. This link works until ${expiryText(data.expires_at)}. Recorded by the patient at home. To take off = (weight before + washback) − dry weight.`)),
    sessions.length ? h('div', { class: 'section no-print' }, h('div', { class: 'btn-row' }, excel, csv, pdf)) : null,
    ...(sessions.length ? reportContent(sessions) : [h('div', { class: 'panel empty' }, h('p', null, 'No completed sessions in these dates.'))]),
  );
}
