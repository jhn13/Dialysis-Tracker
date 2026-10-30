import { h, openSheet, field, numberInput, readNum, toast, confirmBox, icon } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';
import { sumBlock, update as updateSum } from '../sum.js';

const PHASES = [['before', 'Before'], ['during', 'During'], ['after', 'After']];

// Open the session form. Pass an existing session, or a new one from M.newSession().
export function openSession(session, { phase } = {}) {
  const s = JSON.parse(JSON.stringify(session));
  const isNew = !s.id;
  const st = M.settings();
  let current = phase || (s.status === 'in_progress' && s.preWeight != null ? (s.postWeight != null ? 'after' : 'during') : 'before');
  let ufTouched = s.ufGoal != null && s.ufGoal !== M.takeOff(s);

  const body = h('div', { class: 'form' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Part of the session' });
  const pane = h('div', { class: 'form' });
  body.append(seg, pane);

  function drawSeg() {
    seg.replaceChildren(...PHASES.map(([k, label]) => h('button', {
      type: 'button', 'aria-pressed': String(k === current),
      onclick: () => { current = k; drawSeg(); drawPane(); pane.scrollIntoView({ block: 'nearest' }); },
    }, h('span', { class: 'ph ' + k, 'aria-hidden': 'true' }), label)));
  }

  function numField(f) {
    const inp = numberInput(s[f.key], { decimal: !!f.decimal, signed: !!f.signed });
    inp.addEventListener('input', () => { s[f.key] = readNum(inp); onValue(f.key, inp); });
    return field({ label: f.label, unit: f.unit, input: inp });
  }

  let sumEl = null, ufInput = null;
  function onValue(key, inp) {
    if (['preWeight', 'washback', 'targetWeight'].includes(key)) {
      if (sumEl) updateSum(sumEl, s);
      if (!ufTouched && ufInput) {
        const t = M.takeOff(s);
        s.ufGoal = t; ufInput.value = t === null ? '' : String(t);
      }
    }
    if (key === 'ufGoal') ufTouched = true;
  }

  function bpGroup(fields, title) {
    if (!fields.length) return null;
    return h('fieldset', null, h('legend', null, title), h('div', { class: 'grid3' }, fields.map(numField)));
  }

  function drawPane() {
    const vis = M.visibleFields(current);
    const plain = vis.filter(f => !f.group);
    const groups = {};
    vis.filter(f => f.group).forEach(f => (groups[f.group] = groups[f.group] || []).push(f));
    const kids = [];
    sumEl = null; ufInput = null;

    if (current === 'before') {
      const date = h('input', { type: 'date', value: s.date, required: true });
      date.addEventListener('change', () => {
        if (!date.value) return;
        const wasDefault = s.type === (M.isWeeklyDate(s.date) ? 'weekly' : 'routine');
        s.date = date.value;
        if (wasDefault) { s.type = M.isWeeklyDate(s.date) ? 'weekly' : 'routine'; typeSel.value = s.type; }
      });
      const typeSel = h('select', null,
        h('option', { value: 'routine' }, 'Routine'),
        h('option', { value: 'weekly' }, `Weekly (${M.dayName(st.weeklyDay)} extras)`));
      typeSel.value = s.type;
      typeSel.addEventListener('change', () => { s.type = typeSel.value; });
      kids.push(h('div', { class: 'grid2' },
        field({ label: 'Date', input: date }),
        field({ label: 'Session type', input: typeSel })));

      const order = ['preWeight', 'washback', 'targetWeight'];
      const weightFields = order.map(k => plain.find(f => f.key === k)).filter(Boolean);
      const pre = weightFields.find(f => f.key === 'preWeight');
      if (pre) kids.push(numField(pre));
      const rest = weightFields.filter(f => f.key !== 'preWeight');
      if (rest.length) kids.push(h('div', { class: 'grid2' }, rest.map(numField)));
      sumEl = sumBlock(s, { inline: true });
      kids.push(sumEl);
      const uf = plain.find(f => f.key === 'ufGoal');
      if (uf) {
        const fl = numField(uf);
        ufInput = fl.querySelector('input');
        fl.append(h('p', { class: 'hint' }, 'Filled in from the sum above. Change it if your unit sets it differently.'));
        kids.push(fl);
      }
      kids.push(bpGroup(groups['Blood pressure before'] || [], 'Blood pressure before'));
    } else if (current === 'during') {
      if (plain.length) kids.push(...plain.map(numField));
      else kids.push(h('p', { class: 'lead' }, 'No readings switched on for during the session. You can turn them on in Settings.'));
      kids.push(commentsField());
    } else {
      const post = plain.find(f => f.key === 'postWeight');
      if (post) kids.push(numField(post));
      kids.push(bpGroup(groups['Blood pressure after'] || [], 'Blood pressure after'));
      const others = plain.filter(f => f.key !== 'postWeight');
      if (others.length) kids.push(h('div', { class: 'grid2' }, others.map(numField)));

      const filt = h('input', { type: 'checkbox', role: 'switch' });
      filt.checked = !!s.filtersChanged;
      filt.addEventListener('change', () => { s.filtersChanged = filt.checked; });
      kids.push(h('label', { class: 'toggle' }, h('span', null, 'Water filters changed', h('small', null, 'Takes filters off your stock')), filt));

      if (st.givenOptions.length) {
        kids.push(h('fieldset', null, h('legend', null, 'Given or done'),
          h('div', { class: 'chips' }, st.givenOptions.map(opt => {
            const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.given.includes(opt)) }, opt);
            b.addEventListener('click', () => {
              const on = !s.given.includes(opt);
              s.given = on ? [...s.given, opt] : s.given.filter(x => x !== opt);
              b.setAttribute('aria-pressed', String(on));
            });
            return b;
          }))));
      }
      kids.push(commentsField());
      if (!isNew) kids.push(h('button', { type: 'button', class: 'btn ghost', style: { color: 'var(--art)', justifySelf: 'start' }, onclick: del }, 'Delete this session'));
    }
    pane.replaceChildren(...kids.filter(Boolean));
  }

  function commentsField() {
    const ta = h('textarea', { rows: 3, placeholder: 'Alarms, pressures, anything your team should know' });
    ta.value = s.comments || '';
    ta.addEventListener('input', () => { s.comments = ta.value; });
    return field({ label: 'Notes', input: ta });
  }

  async function save(finish) {
    if (!s.date) { toast('Add a date first'); return; }
    if (finish) { s.status = 'complete'; s.finishedAt = s.finishedAt || new Date().toISOString(); }
    await db.put('session', s);
    sheet.close();
    toast(finish ? 'Session finished' : 'Session saved');
  }
  async function del() {
    if (!(await confirmBox({ title: 'Delete this session?', message: `The session on ${M.niceDate(s.date, { year: true })} will be removed, and its supplies go back into your stock count.`, confirm: 'Delete session', danger: true }))) return;
    await db.remove(s.id);
    sheet.close();
    toast('Session deleted');
  }

  const saveBtn = h('button', { type: 'button', class: 'btn' }, 'Save');
  saveBtn.addEventListener('click', () => save(false));
  const footer = [saveBtn];
  if (s.status !== 'complete') {
    const fin = h('button', { type: 'button', class: 'btn primary' }, 'Finish session');
    fin.addEventListener('click', () => save(true));
    footer.push(fin);
  } else {
    saveBtn.classList.add('primary');
    saveBtn.textContent = 'Save changes';
  }

  drawSeg(); drawPane();
  const sheet = openSheet({ title: isNew ? 'New session' : `Session on ${M.niceDate(s.date)}`, body, footer });
  return sheet;
}

export function sessionSummary(s) {
  const bits = [];
  if (s.preWeight != null || s.postWeight != null) bits.push(`${M.fmt1(s.preWeight) || '—'} → ${M.fmt1(s.postWeight) || '—'} kg`);
  if (s.ufAchieved != null || s.ufGoal != null) bits.push(`UF ${M.fmt(s.ufAchieved) || '—'} of ${M.fmt(s.ufGoal) || '—'} L`);
  return bits.join(', ');
}
const bp = (a, b) => (a != null && b != null) ? `${a}/${b}` : '';

export function sessionRow(s) {
  const preBp = bp(s.preSys, s.preDia), postBp = bp(s.postSys, s.postDia);
  return h('button', { type: 'button', class: 'row', onclick: () => openSession(s) },
    h('span', { class: 't' }, M.niceDate(s.date), s.type === 'weekly' ? h('span', { class: 'muted', style: { fontWeight: 400 } }, '  weekly') : null,
      s.status === 'in_progress' ? h('span', { class: 'badge low', style: { marginLeft: '8px' } }, 'In progress') : null),
    h('span', { class: 's' }, sessionSummary(s) || 'No readings yet'),
    h('span', { class: 'v' }, preBp || '', postBp ? h('small', null, 'after ' + postBp) : null));
}

export function render(main) {
  const list = M.sessions();
  const add = h('button', { type: 'button', class: 'btn primary block', onclick: () => openSession(M.newSession()) }, icon('plus'), 'New session');
  if (!list.length) {
    main.replaceChildren(h('div', { class: 'panel empty' },
      h('p', null, 'Your sessions will appear here. Start one from Today, or add a past session.'), add));
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
