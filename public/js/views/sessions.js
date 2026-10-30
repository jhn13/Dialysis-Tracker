// Sessions have two stages: active (started) and complete.
// Start: weight, BP before, UF goal. While active: notes. Complete: weight after, BP after, machine figures.
import { h, openSheet, field, numberInput, readNum, toast, confirmBox, icon } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';
import { sumBlock, update as updateSum } from '../sum.js';

const clone = o => JSON.parse(JSON.stringify(o));
export const timeOf = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

// Builds the inputs for one stage. Edits go straight into `s`.
function stageFields(s, phase, { onWeights } = {}) {
  const vis = M.visibleFields(phase);
  const byKey = k => vis.find(f => f.key === k);
  const inputs = {};
  const numField = f => {
    const inp = numberInput(s[f.key], { decimal: !!f.decimal });
    inputs[f.key] = inp;
    inp.addEventListener('input', () => { s[f.key] = readNum(inp); if (onWeights) onWeights(f.key); });
    return field({ label: f.label, unit: f.unit, input: inp });
  };
  const bp = title => {
    const fs = vis.filter(f => f.group === title);
    return fs.length ? h('fieldset', null, h('legend', null, title), h('div', { class: 'grid3' }, fs.map(numField))) : null;
  };
  const kids = [];
  if (phase === 'start') {
    if (byKey('preWeight')) kids.push(numField(byKey('preWeight')));
    const pair = ['targetWeight', 'washback'].map(byKey).filter(Boolean);
    if (pair.length) kids.push(h('div', { class: 'grid2' }, pair.map(numField)));
    kids.push('SUM'); // placeholder, filled by caller
    if (byKey('ufGoal')) kids.push(numField(byKey('ufGoal')));
    kids.push(bp('Blood pressure before'));
  } else {
    if (byKey('postWeight')) kids.push(numField(byKey('postWeight')));
    kids.push(bp('Blood pressure after'));
    const rest = ['ufAchieved', 'bloodFlow', 'bloodVolume'].map(byKey).filter(Boolean);
    if (rest.length) kids.push(h('div', { class: 'grid2' }, rest.map(numField)));
  }
  return { kids: kids.filter(Boolean), inputs };
}

// Weight, dry weight and washback feed the sum; the UF goal follows it until you change it yourself.
function startStage(s) {
  let ufTouched = s.ufGoal != null && s.ufGoal !== M.takeOff(s);
  let sumEl = null;
  const st = stageFields(s, 'start', {
    onWeights: key => {
      if (key === 'ufGoal') { ufTouched = true; return; }
      if (!['preWeight', 'washback', 'targetWeight'].includes(key)) return;
      updateSum(sumEl, s);
      if (!ufTouched && st.inputs.ufGoal) { const t = M.takeOff(s); s.ufGoal = t; st.inputs.ufGoal.value = t === null ? '' : String(t); }
    },
  });
  sumEl = sumBlock(s, { inline: true });
  const kids = st.kids.map(k => k === 'SUM' ? sumEl : k);
  if (st.inputs.ufGoal) st.inputs.ufGoal.closest('.field').append(h('p', { class: 'hint' }, 'Filled in from the sum. Change it if your unit sets it differently.'));
  return { kids, focus: st.inputs.preWeight };
}

function dateAndType(s) {
  const st = M.settings();
  const date = h('input', { type: 'date', value: s.date, required: true });
  const typeSel = h('select', null,
    h('option', { value: 'routine' }, 'Routine'),
    h('option', { value: 'weekly' }, `Weekly items (${M.dayName(st.weeklyDay)})`));
  typeSel.value = s.type;
  date.addEventListener('change', () => {
    if (!date.value) return;
    const wasDefault = s.type === (M.isWeeklyDate(s.date) ? 'weekly' : 'routine');
    s.date = date.value;
    if (wasDefault) { s.type = M.isWeeklyDate(s.date) ? 'weekly' : 'routine'; typeSel.value = s.type; }
  });
  typeSel.addEventListener('change', () => { s.type = typeSel.value; });
  return h('div', { class: 'grid2' }, field({ label: 'Date', input: date }), field({ label: 'Session type', input: typeSel, hint: s.type === 'weekly' ? 'Uses your weekly items too' : null }));
}

function extras(s) {
  const st = M.settings();
  const kids = [];
  const monthly = M.monthlyItems();
  if (monthly.length || s.filtersChanged) {
    const cb = h('input', { type: 'checkbox', role: 'switch' });
    cb.checked = !!s.filtersChanged;
    cb.addEventListener('change', () => { s.filtersChanged = cb.checked; });
    kids.push(h('label', { class: 'toggle' }, h('span', null, 'Monthly change done', h('small', null, monthly.length ? `Uses ${monthly.map(i => i.name.toLowerCase()).join(', ')}` : 'Uses your monthly items')), cb));
  }
  if (st.givenOptions.length) {
    kids.push(h('fieldset', null, h('legend', null, 'Given or done'),
      h('div', { class: 'chips' }, st.givenOptions.map(opt => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String((s.given || []).includes(opt)) }, opt);
        b.addEventListener('click', () => {
          const on = !(s.given || []).includes(opt);
          s.given = on ? [...(s.given || []), opt] : s.given.filter(x => x !== opt);
          b.setAttribute('aria-pressed', String(on));
        });
        return b;
      }))));
  }
  return kids;
}

// A list of timed notes with a box to add another. `save` is called after each change.
export function notesBlock(s, { save, placeholder = 'Alarms, pressures, anything your team should know' } = {}) {
  const wrap = h('div', { class: 'notes' });
  const draw = () => {
    const list = M.sessionNotes(s);
    const ta = h('textarea', { rows: 2, placeholder, 'aria-label': 'New note' });
    const add = h('button', { type: 'button', class: 'btn small' }, 'Add note');
    const doAdd = async () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      s.notes = [...(s.notes || []), { at: new Date().toISOString(), text }];
      if (save) await save();
      draw();
      toast('Note added');
    };
    add.addEventListener('click', doAdd);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAdd(); } });
    wrap.replaceChildren(
      list.length ? h('ul', { class: 'note-list' }, list.map((n, i) => h('li', null,
        h('span', { class: 'when' }, n.at ? timeOf(n.at) : 'Note'),
        h('span', { class: 'what' }, n.text),
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Remove note', onclick: async () => {
          if (n.at === null) s.comments = ''; else s.notes = (s.notes || []).filter(x => x !== n);
          if (save) await save(); draw();
        } }, icon('close'))))) : null,
      h('div', { class: 'note-add' }, ta, add));
  };
  draw();
  return wrap;
}

// ---------- start a session ----------
export function openStart(session) {
  const s = clone(session);
  const isNew = !s.id;
  const start = startStage(s);
  if (start.focus && s.preWeight == null) start.focus.setAttribute('autofocus', '');
  const body = h('div', { class: 'form' }, dateAndType(s), ...start.kids);
  const btn = h('button', { type: 'button', class: 'btn primary' }, isNew ? 'Start session' : 'Save');
  btn.addEventListener('click', async () => {
    if (!s.date) { toast('Add a date first'); return; }
    if (isNew) s.startedAt = new Date().toISOString();
    await db.put('session', s);
    sheet.close();
    toast(isNew ? 'Session started' : 'Saved');
  });
  const footer = [btn];
  if (!isNew) {
    const del = h('button', { type: 'button', class: 'btn ghost', style: { color: 'var(--art)' } }, 'Cancel session');
    del.addEventListener('click', async () => {
      if (!(await confirmBox({ title: 'Cancel this session?', message: 'It will be removed, along with any notes, and nothing comes off your supplies.', confirm: 'Cancel session', danger: true }))) return;
      await db.remove(s.id); sheet.close(); toast('Session cancelled');
    });
    footer.unshift(del);
  }
  const sheet = openSheet({ title: isNew ? 'Start a session' : 'Start details', body, footer });
}

// ---------- complete a session ----------
export function openComplete(session) {
  const s = clone(session);
  const body = h('div', { class: 'form' },
    ...stageFields(s, 'complete').kids,
    ...extras(s),
    h('fieldset', null, h('legend', null, 'Notes'), notesBlock(s, { placeholder: 'Anything else from this session' })));
  const btn = h('button', { type: 'button', class: 'btn primary' }, 'Complete session');
  btn.addEventListener('click', async () => {
    s.status = 'complete';
    s.finishedAt = new Date().toISOString();
    await db.put('session', s);
    sheet.close();
    toast('Session complete');
  });
  const sheet = openSheet({ title: 'Complete session', body, footer: [btn] });
}

// ---------- edit any session (both stages together) ----------
export function openEdit(session) {
  if (session.status === 'in_progress') { location.hash = '#today'; return; }
  const s = clone(session);
  const body = h('div', { class: 'form' },
    dateAndType(s),
    h('h3', { class: 'stage-head' }, h('span', { class: 'ph before', 'aria-hidden': 'true' }), 'Start'),
    ...startStage(s).kids,
    h('h3', { class: 'stage-head' }, h('span', { class: 'ph after', 'aria-hidden': 'true' }), 'Complete'),
    ...stageFields(s, 'complete').kids,
    ...extras(s),
    h('fieldset', null, h('legend', null, 'Notes'), notesBlock(s)),
    h('button', { type: 'button', class: 'btn ghost', style: { color: 'var(--art)', justifySelf: 'start' }, onclick: del }, 'Delete this session'));
  const btn = h('button', { type: 'button', class: 'btn primary' }, 'Save changes');
  btn.addEventListener('click', async () => { await db.put('session', s); sheet.close(); toast('Session saved'); });
  async function del() {
    if (!(await confirmBox({ title: 'Delete this session?', message: `The session on ${M.niceDate(s.date, { year: true })} will be removed, and its supplies go back into your stock count.`, confirm: 'Delete session', danger: true }))) return;
    await db.remove(s.id); sheet.close(); toast('Session deleted');
  }
  const sheet = openSheet({ title: `Session on ${M.niceDate(s.date)}`, body, footer: [btn] });
}

// ---------- list ----------
export function sessionSummary(s) {
  const bits = [];
  if (s.preWeight != null || s.postWeight != null) bits.push(`${M.fmt1(s.preWeight) || '—'} → ${M.fmt1(s.postWeight) || '—'} kg`);
  if (s.ufAchieved != null || s.ufGoal != null) bits.push(`UF ${M.fmt1(s.ufAchieved) || '—'} of ${M.fmt1(s.ufGoal) || '—'} L`);
  return bits.join(', ');
}
const bp = (a, b) => (a != null && b != null) ? `${a}/${b}` : '';

export function sessionRow(s) {
  const preBp = bp(s.preSys, s.preDia), postBp = bp(s.postSys, s.postDia);
  const active = s.status === 'in_progress';
  return h('button', { type: 'button', class: 'row', onclick: () => openEdit(s) },
    h('span', { class: 't' }, M.niceDate(s.date), s.type === 'weekly' ? h('span', { class: 'muted', style: { fontWeight: 400 } }, '  weekly') : null,
      active ? h('span', { class: 'badge active', style: { marginLeft: '8px' } }, 'Active') : null),
    h('span', { class: 's' }, sessionSummary(s) || 'No readings yet'),
    h('span', { class: 'v' }, preBp ? `${preBp}` : '', postBp ? h('small', null, 'after ' + postBp) : null));
}

export function render(main) {
  const list = M.sessions();
  const active = list.find(s => s.status === 'in_progress');
  const add = active
    ? h('a', { class: 'btn primary block', href: '#today' }, 'Go to your active session')
    : h('button', { type: 'button', class: 'btn primary block', onclick: () => openStart(M.newSession()) }, icon('plus'), 'Start a session');
  if (!list.length) {
    main.replaceChildren(h('div', { class: 'panel empty' },
      h('p', null, 'Your sessions will appear here. Start one when you sit down to dialyse.'), add));
    return;
  }
  const months = new Map();
  for (const s of list) {
    const k = s.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(s);
  }
  main.replaceChildren(add, ...[...months.entries()].map(([k, ss]) =>
    h('section', { class: 'section' },
      h('h2', { class: 'month-label' }, M.monthLabel(k + '-01'), h('span', { class: 'muted', style: { fontWeight: 400 } }, `  ${ss.length} session${ss.length === 1 ? '' : 's'}`)),
      h('div', { class: 'panel rows' }, ss.map(sessionRow)))));
}
