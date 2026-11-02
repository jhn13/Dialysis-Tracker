// Files for your medical team (CSV and Excel), and full backups.
import * as db from './db.js';
import * as M from './model.js';
import { deliverFile, loadScript } from './ui.js';

const ukDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

function sessionTable(sessions) {
  const st = M.settings();
  const fields = M.SESSION_FIELDS.filter(f => f.required || !st.hidden[f.key]);
  const label = f => (f.group ? f.group.replace('Blood pressure', 'BP') + ' ' + f.label.toLowerCase() : f.label) + (f.unit ? ` (${f.unit})` : '');
  const head = ['Date', 'Session type'];
  const cols = [];
  for (const f of fields) {
    head.push(label(f)); cols.push(s => s[f.key] ?? null);
    if (f.key === 'preWeight') { head.push('To take off (kg)'); cols.push(s => M.takeOff(s)); }
  }
  head.push('Monthly change done', 'Given or done', 'Notes', 'Completed');
  const rows = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).map(s => [
    s.date, s.type === 'weekly' ? 'Weekly' : 'Routine',
    ...cols.map(c => c(s)),
    s.filtersChanged ? 'Yes' : 'No', (s.given || []).join(', '), M.notesText(s), s.status === 'complete' ? 'Yes' : 'No',
  ]);
  return { head, rows };
}

function bpTable(readings) {
  const days = M.sessionDates();
  const head = ['Date', 'Time', 'Dialysis day', 'Systolic (mmHg)', 'Diastolic (mmHg)', 'Pulse (bpm)', 'Note'];
  const rows = [...readings].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map(r =>
    [r.date, r.time || '', (r.dialysisDay ?? days.has(r.date)) ? 'Yes' : 'No', r.sys, r.dia, r.pulse ?? null, r.note || '']);
  return { head, rows };
}

export function tables(sessions, readings) { return { sessions: sessionTable(sessions), bp: bpTable(readings) }; }

function csv({ head, rows }) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const fixDate = r => r.map((v, i) => i === 0 && typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? ukDate(v) : v);
  return '﻿' + [head, ...rows.map(fixDate)].map(r => r.map(esc).join(',')).join('\r\n');
}

const stamp = (from, to) => `${from}_to_${to}`;

export async function downloadCSV(kind, sessions, readings, from, to) {
  const t = kind === 'sessions' ? sessionTable(sessions) : bpTable(readings);
  const blob = new Blob([csv(t)], { type: 'text/csv;charset=utf-8' });
  await deliverFile(blob, `dialysis-${kind === 'sessions' ? 'sessions' : 'bp'}_${stamp(from, to)}.csv`, 'Dialysis records');
}

export async function downloadExcel(sessions, readings, from, to) {
  await loadScript('/vendor/xlsx.mini.min.js');
  const XLSX = window.XLSX;
  const st = M.settings();
  const wb = XLSX.utils.book_new();
  const sheet = ({ head, rows }, widths) => {
    const aoa = [head, ...rows.map(r => r.map((v, i) => i === 0 && typeof v === 'string' ? M.parseISO(v) : v))];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    for (let r = 1; r <= rows.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 0 })]; if (c) { c.t = 'd'; c.z = 'dd/mm/yyyy'; } }
    ws['!cols'] = head.map((hd, i) => ({ wch: widths && widths[i] || Math.max(10, Math.min(28, hd.length + 2)) }));
    return ws;
  };
  const s = sessionTable(sessions);
  const notesCol = s.head.indexOf('Notes');
  const sw = s.head.map((hd, i) => i === notesCol ? 60 : null);
  XLSX.utils.book_append_sheet(wb, sheet(s, sw), 'Sessions');
  const about = [
    ['Dialysis records'], ['Name', st.name || ''], ['From', ukDate(from)], ['To', ukDate(to)],
    ['Sessions', sessions.length],
    ['Created', new Date().toLocaleString('en-GB')],
    ['To take off', '(Weight before + washback) − dry weight'],
  ];
  const wsA = XLSX.utils.aoa_to_sheet(about); wsA['!cols'] = [{ wch: 30 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, wsA, 'About');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await deliverFile(blob, `dialysis-records_${stamp(from, to)}.xlsx`, 'Dialysis records');
}

// ---------- backups ----------
export async function downloadBackup() {
  const records = db.allRecords().filter(r => !r.deleted).map(({ id, kind, data, updated_at }) => ({ id, kind, data, updated_at }));
  const blob = new Blob([JSON.stringify({ app: 'dialysis-tracker', version: 1, exported_at: new Date().toISOString(), records }, null, 1)], { type: 'application/json' });
  await deliverFile(blob, `dialysis-backup_${M.todayISO()}.json`, 'Dialysis Tracker backup');
}

// ask({ backupItems, localItems }) decides what happens when both have a supplies list: 'keep' or 'replace'.
export async function restoreBackup(file, { ask } = {}) {
  const text = await file.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('That file isn’t a Dialysis Tracker backup.'); }
  if (!json || json.app !== 'dialysis-tracker' || !Array.isArray(json.records)) throw new Error('That file isn’t a Dialysis Tracker backup.');
  const kinds = new Set(['settings', 'session', 'bp', 'item', 'delivery', 'stockcheck']);
  let rows = json.records.filter(r => r && typeof r.id === 'string' && kinds.has(r.kind) && r.data && typeof r.data === 'object')
    .map(r => ({ id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at || new Date().toISOString(), deleted: false }));

  const backupItems = rows.filter(r => r.kind === 'item');
  const localItems = M.items();
  const backupIds = new Set(backupItems.map(r => r.id));
  const sameList = localItems.length && localItems.every(it => backupIds.has(it.id));
  if (backupItems.length && localItems.length && !sameList && ask) {
    const choice = await ask({ backupItems: backupItems.length, localItems: localItems.length });
    if (!choice) return { cancelled: true };
    if (choice === 'keep') {
      rows = rows.filter(r => !['item', 'delivery', 'stockcheck', 'settings'].includes(r.kind));
    } else {
      const old = new Set(localItems.map(i => i.id));
      const linked = [...M.deliveries(), ...M.stockChecks()].filter(x => old.has(x.itemId)).map(x => x.id);
      await db.remove([...old, ...linked]);
      const now = new Date().toISOString();
      rows = rows.map(r => r.kind === 'settings' ? { ...r, updated_at: now } : r);
    }
  }
  const n = await db.applyIncoming(rows, { markDirty: true });
  const sessions = rows.filter(r => r.kind === 'session').length;
  return { total: rows.length, applied: n, sessions };
}

export function askAboutSupplies({ backupItems, localItems }, choiceBox) {
  return choiceBox({
    title: 'Which supplies list?',
    message: `The backup has its own supplies list (${backupItems} items). You already have ${localItems} items set up here. Your sessions are added either way.`,
    options: [
      { label: 'Use the backup’s list', value: 'replace', primary: true, hint: 'Replaces your current items with the backup’s, including its stock counts and deliveries.' },
      { label: 'Keep my current list', value: 'keep', hint: 'Only sessions are added. Your items, stock counts and settings stay as they are.' },
    ],
  });
}
