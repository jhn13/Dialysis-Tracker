import { h, field, toast } from '../ui.js';
import * as M from '../model.js';
import { weightChart, bpChart } from '../charts.js';
import * as X from '../export.js';

let preset = '30';
let custom = { from: null, to: null };

function range() {
  const today = M.todayISO();
  const d = M.parseISO(today);
  if (preset === '30') return { from: M.addDays(today, -29), to: today };
  if (preset === 'this') return { from: today.slice(0, 8) + '01', to: today };
  if (preset === 'last') {
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1), last = new Date(d.getFullYear(), d.getMonth(), 0);
    return { from: M.todayISO(first), to: M.todayISO(last) };
  }
  return { from: custom.from || M.addDays(today, -29), to: custom.to || today };
}

const avg = arr => { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export function render(main) {
  const st = M.settings();
  const { from, to } = range();
  const inRange = x => x.date >= from && x.date <= to;
  const sessions = M.sessions().filter(inRange);
  const readings = M.bpReadings().filter(inRange);

  const seg = h('div', { class: 'seg no-print', role: 'group', 'aria-label': 'Date range' },
    [['30', 'Last 30 days'], ['this', 'This month'], ['last', 'Last month'], ['custom', 'Choose']].map(([k, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(preset === k), onclick: () => { preset = k; if (k === 'custom') custom = range(); render(main); } }, label)));

  let pickers = null;
  if (preset === 'custom') {
    const f = h('input', { type: 'date', value: from, max: to }), t = h('input', { type: 'date', value: to, min: from });
    f.addEventListener('change', () => { if (f.value) { custom.from = f.value; render(main); } });
    t.addEventListener('change', () => { if (t.value) { custom.to = t.value; render(main); } });
    pickers = h('div', { class: 'grid2 no-print' }, field({ label: 'From', input: f }), field({ label: 'To', input: t }));
  }

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { console.error(e); toast('Couldn’t create the file. Try again.'); } finally { btn.disabled = false; } };
  const excel = h('button', { type: 'button', class: 'btn primary' }, 'Download Excel');
  excel.addEventListener('click', () => busy(excel, () => X.downloadExcel(sessions, readings, from, to)));
  const pdf = h('button', { type: 'button', class: 'btn' }, 'Print or save as PDF');
  pdf.addEventListener('click', () => window.print());
  const csvS = h('button', { type: 'button', class: 'btn small' }, 'Sessions CSV');
  csvS.addEventListener('click', () => busy(csvS, () => X.downloadCSV('sessions', sessions, readings, from, to)));
  const csvB = h('button', { type: 'button', class: 'btn small' }, 'BP readings CSV');
  csvB.addEventListener('click', () => busy(csvB, () => X.downloadCSV('bp', sessions, readings, from, to)));

  const rangeText = `${M.niceDate(from, { year: from.slice(0, 4) !== to.slice(0, 4), day: false })} to ${M.niceDate(to, { year: true, day: false })}`;
  const bpAvg = (a, b) => { const s = avg(sessions.map(x => x[a])), d = avg(sessions.map(x => x[b])); return s === null || d === null ? '—' : `${Math.round(s)}/${Math.round(d)}`; };
  const kg = v => v === null ? '—' : M.fmt1(Math.round(v * 10) / 10);
  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, sessions.length), h('span', null, 'sessions')),
    h('div', { class: 'stat' }, h('b', null, kg(avg(sessions.map(s => s.preWeight)))), h('span', null, 'average weight before, kg')),
    h('div', { class: 'stat' }, h('b', null, kg(avg(sessions.map(s => s.postWeight)))), h('span', null, 'average weight after, kg')),
    h('div', { class: 'stat' }, h('b', null, kg(avg(sessions.map(s => s.ufAchieved)))), h('span', null, 'average UF achieved, L')),
    h('div', { class: 'stat' }, h('b', null, bpAvg('preSys', 'preDia')), h('span', null, 'average BP before')),
    h('div', { class: 'stat' }, h('b', null, bpAvg('postSys', 'postDia')), h('span', null, 'average BP after')));

  const v = x => x ?? '';
  const bp = (a, b) => a != null && b != null ? `${a}/${b}` : '';
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const sessionTable = sorted.length ? h('section', { class: 'section table-section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Sessions')),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, ['Date', 'Before kg', 'After kg', 'Take off', 'UF goal', 'UF done', 'BP before', 'BP after', 'Flow', 'Notes'].map(t => h('th', { scope: 'col' }, t)))),
      h('tbody', null, sorted.map(s => h('tr', null,
        h('td', null, M.niceDate(s.date)), h('td', null, M.fmt1(s.preWeight)), h('td', null, M.fmt1(s.postWeight)),
        h('td', null, M.fmt1(M.takeOff(s))), h('td', null, M.fmt1(s.ufGoal)), h('td', null, M.fmt1(s.ufAchieved)),
        h('td', null, bp(s.preSys, s.preDia)), h('td', null, bp(s.postSys, s.postDia)), h('td', null, v(s.bloodFlow)),
        h('td', { class: 'note' }, [...(s.given || []).filter(g => !(s.comments || '').toLowerCase().includes(g.toLowerCase().split(' ')[0])), s.comments].filter(Boolean).join('. ')))))))) : null;

  const days = M.sessionDates();
  const sortedBp = [...readings].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const bpTable = sortedBp.length ? h('section', { class: 'section table-section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Blood pressure between sessions')),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, ['Date', 'Time', 'Dialysis day', 'BP', 'Pulse', 'Note'].map(t => h('th', { scope: 'col' }, t)))),
      h('tbody', null, sortedBp.map(r => h('tr', null,
        h('td', null, M.niceDate(r.date)), h('td', null, r.time || ''), h('td', null, (r.dialysisDay ?? days.has(r.date)) ? 'Yes' : ''),
        h('td', null, `${r.sys}/${r.dia}`), h('td', null, v(r.pulse)), h('td', { class: 'note' }, r.note || ''))))))) : null;

  const nothing = !sessions.length && !readings.length;
  main.replaceChildren(...[
    h('div', { class: 'print-only' },
      h('h1', { style: { fontSize: '20pt', marginBottom: '4px' } }, `Dialysis records${st.name ? ' for ' + st.name : ''}`),
      h('p', null, `${rangeText}. Created ${M.niceDate(M.todayISO(), { year: true })}.`),
      h('p', { class: 'muted small' }, 'To take off = (weight before + washback) − target weight.')),
    seg, pickers,
    h('p', { class: 'lead no-print' }, nothing ? `Nothing recorded from ${rangeText}.` : `${rangeText}: ${sessions.length} session${sessions.length === 1 ? '' : 's'} and ${readings.length} blood pressure reading${readings.length === 1 ? '' : 's'}.`),
    nothing ? null : h('div', { class: 'section no-print' },
      h('div', { class: 'btn-row' }, excel, pdf),
      h('div', { class: 'btn-row' }, csvS, csvB)),
    nothing ? null : stats,
    weightChart(sessions), bpChart(sessions), sessionTable, bpTable].filter(Boolean));
}
