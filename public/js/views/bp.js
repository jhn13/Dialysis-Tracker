import { h, openSheet, field, numberInput, readNum, toast, confirmBox, icon } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';

export function openReading(reading) {
  const r = reading ? { ...reading } : { date: M.todayISO(), time: M.nowTime() };
  const isNew = !r.id;
  const date = h('input', { type: 'date', value: r.date, required: true });
  const time = h('input', { type: 'time', value: r.time || '' });
  const sys = numberInput(r.sys, { decimal: false });
  const dia = numberInput(r.dia, { decimal: false });
  const pulse = numberInput(r.pulse, { decimal: false });
  const note = h('input', { type: 'text', value: r.note || '', placeholder: 'Optional, for example after a walk' });
  sys.setAttribute('autofocus', '');
  const err = h('p', { class: 'err', role: 'alert' });

  const body = h('div', { class: 'form' },
    h('div', { class: 'grid2' }, field({ label: 'Date', input: date }), field({ label: 'Time', input: time })),
    h('div', { class: 'grid3' }, field({ label: 'Systolic', input: sys }), field({ label: 'Diastolic', input: dia }), field({ label: 'Pulse', input: pulse })),
    field({ label: 'Note', input: note }), err,
    !isNew ? h('button', { type: 'button', class: 'btn ghost', style: { color: 'var(--art)', justifySelf: 'start' }, onclick: del }, 'Delete this reading') : null);

  const saveBtn = h('button', { type: 'button', class: 'btn primary' }, isNew ? 'Add reading' : 'Save changes');
  saveBtn.addEventListener('click', async () => {
    const out = { ...r, date: date.value, time: time.value, sys: readNum(sys), dia: readNum(dia), pulse: readNum(pulse), note: note.value.trim() };
    if (!out.date) { err.textContent = 'Add the date of the reading.'; return; }
    if (out.sys === null || out.dia === null) { err.textContent = 'Add both the systolic and diastolic numbers.'; return; }
    await db.put('bp', out);
    sheet.close();
    toast(isNew ? 'Reading added' : 'Reading saved');
  });
  async function del() {
    if (!(await confirmBox({ title: 'Delete this reading?', message: 'This blood pressure reading will be removed.', confirm: 'Delete reading', danger: true }))) return;
    await db.remove(r.id); sheet.close(); toast('Reading deleted');
  }
  const sheet = openSheet({ title: isNew ? 'Blood pressure reading' : 'Edit reading', body, footer: [saveBtn] });
}

export function render(main) {
  const list = M.bpReadings();
  const dialysisDays = M.sessionDates();
  const add = h('button', { type: 'button', class: 'btn primary block', onclick: () => openReading() }, icon('plus'), 'Add reading');
  if (!list.length) {
    main.replaceChildren(h('div', { class: 'panel empty' },
      h('p', null, 'Log blood pressure readings between sessions here. Readings taken during a session are part of the session itself.'), add));
    return;
  }
  const days = new Map();
  for (const r of list) { if (!days.has(r.date)) days.set(r.date, []); days.get(r.date).push(r); }
  main.replaceChildren(add, ...[...days.entries()].map(([d, rs]) =>
    h('section', { class: 'section' },
      h('h2', { class: 'month-label' }, M.niceDate(d, { year: d.slice(0, 4) !== M.todayISO().slice(0, 4) }),
        (rs.some(r => r.dialysisDay === true) || (dialysisDays.has(d) && !rs.some(r => r.dialysisDay === false))) ? h('span', { style: { fontWeight: 400 } }, '  dialysis day') : null),
      h('div', { class: 'panel rows' }, rs.map(r => h('button', { type: 'button', class: 'row', onclick: () => openReading(r) },
        h('span', { class: 't' }, r.time || 'No time'),
        h('span', { class: 's' }, r.note || (r.pulse != null ? `Pulse ${r.pulse}` : '')),
        h('span', { class: 'v' }, `${r.sys}/${r.dia}`, r.pulse != null && r.note ? h('small', null, `pulse ${r.pulse}`) : null)))))));
}
