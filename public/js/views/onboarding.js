// First-run setup: what the app is for, then dialysis days, weights and supplies.
import { h, svg, field, numberInput, readNum, toast } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';
import { sumBlock, update as updateSum } from '../sum.js';
import { restoreBackup } from '../export.js';

const STEPS = ['days', 'weights', 'supplies'];

export function startSetup(root, { mark, onDone }) {
  const st = M.settings();
  const state = {
    step: 'welcome',
    name: st.name || '',
    dialysisDays: [...st.dialysisDays],
    weeklyDay: st.weeklyDay,
    targetWeight: st.targetWeight,
    washback: st.washback,
    supplies: M.COMMON_SUPPLIES.map(([name, unit, freq, qty, on]) => ({ name, unit, freq, qty, on, stock: null })),
  };

  function frame({ title, lead, body, primary, secondary, back }) {
    const idx = STEPS.indexOf(state.step);
    const progress = idx >= 0 ? h('div', { class: 'setup-progress' },
      h('span', { class: 'small muted' }, `Step ${idx + 1} of ${STEPS.length}`),
      h('div', { class: 'bars', 'aria-hidden': 'true' }, STEPS.map((_, i) => h('i', { class: i <= idx ? 'on' : '' })))) : null;
    const head = h('div', { class: 'setup-head' },
      back ? h('button', { type: 'button', class: 'btn ghost small', style: { paddingLeft: 0 }, onclick: back }, '‹ Back') : (state.step === 'welcome' ? svg(mark) : null),
      progress);
    const page = h('div', { class: 'setup' },
      head,
      h('h1', null, title),
      lead ? h('p', { class: 'lead' }, lead) : null,
      h('div', { class: 'setup-body' }, body),
      h('div', { class: 'setup-foot' }, secondary, primary));
    root.replaceChildren(page);
    const m = page.querySelector('.setup-head > svg'); if (m) m.classList.add('mark');
    window.scrollTo(0, 0);
  }

  const go = step => { state.step = step; draw(); };
  const next = () => go(STEPS[STEPS.indexOf(state.step) + 1] || 'done');
  const prev = () => go(STEPS[STEPS.indexOf(state.step) - 1] || 'welcome');
  const btn = (label, onclick, cls = 'btn primary') => h('button', { type: 'button', class: cls, onclick }, label);

  function draw() {
    ({ welcome, days, weights, supplies, done })[state.step]();
  }

  // ---------- welcome ----------
  function welcome() {
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const r = await restoreBackup(f);
        if (!db.get('settings')) await M.saveSettings({});
        toast(`Restored ${r.applied} records`);
        onDone();
      } catch (e) { toast(e.message); }
    });
    frame({
      title: 'Your dialysis, in one place',
      lead: 'For people who dialyse at home. It keeps the records your team asks for, without the spreadsheet.',
      body: h('div', { class: 'form' },
        h('ul', { class: 'promise' },
          h('li', null, h('b', null, 'Log each session'), h('span', null, 'Weigh in and the app works out what to take off, with the sum shown. Add notes as you go, then complete it.')),
          h('li', null, h('b', null, 'Know when to order'), h('span', null, 'Each session takes its supplies off your stock, so you can see what’s running low.')),
          h('li', null, h('b', null, 'Share with your team'), h('span', null, 'Send a month of records as Excel, CSV or a PDF report.'))),
        h('p', { class: 'hint' }, 'Setup takes about two minutes. You can change everything later in Settings. The app keeps records only. It doesn’t give medical advice.'),
        file),
      primary: btn('Set up', () => go('days')),
      secondary: btn('Restore a backup', () => file.click(), 'btn ghost'),
    });
  }

  // ---------- dialysis days ----------
  function days() {
    const name = h('input', { type: 'text', value: state.name, autocomplete: 'given-name', placeholder: 'Optional' });
    name.addEventListener('input', () => { state.name = name.value; });
    const weekly = h('select');
    const drawWeekly = () => {
      weekly.replaceChildren(...state.dialysisDays.map(d => h('option', { value: d }, M.dayName(d))));
      if (!state.dialysisDays.includes(state.weeklyDay)) state.weeklyDay = state.dialysisDays[0];
      weekly.value = String(state.weeklyDay);
      weekly.disabled = !state.dialysisDays.length;
    };
    weekly.addEventListener('change', () => { state.weeklyDay = +weekly.value; });
    const count = h('p', { class: 'hint' });
    const err = h('p', { class: 'err', role: 'alert' });
    const chips = h('div', { class: 'chips days' }, M.DAY_ORDER.map(d => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.dialysisDays.includes(d)), 'aria-label': M.dayName(d) }, M.dayShort(d));
      b.addEventListener('click', () => {
        const on = !state.dialysisDays.includes(d);
        state.dialysisDays = on ? [...state.dialysisDays, d] : state.dialysisDays.filter(x => x !== d);
        state.dialysisDays.sort((a, c) => M.DAY_ORDER.indexOf(a) - M.DAY_ORDER.indexOf(c));
        b.setAttribute('aria-pressed', String(on));
        drawWeekly(); drawCount(); err.textContent = '';
      });
      return b;
    }));
    const drawCount = () => { const n = state.dialysisDays.length; count.textContent = n ? `${n} session${n === 1 ? '' : 's'} a week. Used to work out how long your supplies last.` : 'Pick at least one day.'; };
    drawWeekly(); drawCount();
    frame({
      title: 'When do you dialyse?',
      lead: 'Pick your usual days. If they change from week to week, pick the days you dialyse most often.',
      back: () => go('welcome'),
      body: h('div', { class: 'form' },
        h('fieldset', null, h('legend', null, 'Dialysis days'), chips, count),
        field({ label: 'Weekly items on', input: weekly, hint: 'Some things, like a dressing change, happen once a week. Pick the session they go with.' }),
        field({ label: 'Your name', input: name, hint: 'Shown at the top of reports for your team.' }),
        err),
      primary: btn('Continue', () => { if (!state.dialysisDays.length) { err.textContent = 'Pick at least one dialysis day.'; return; } next(); }),
    });
  }

  // ---------- weights ----------
  function weights() {
    const tw = numberInput(state.targetWeight, { placeholder: 'e.g. 72.5' });
    const wb = numberInput(state.washback, { placeholder: 'e.g. 0.4' });
    const example = () => ({ preWeight: state.targetWeight != null ? M.r2(state.targetWeight + 1.5) : null, washback: state.washback, targetWeight: state.targetWeight });
    const sum = sumBlock(example(), { inline: true });
    const upd = () => { state.targetWeight = readNum(tw); state.washback = readNum(wb); updateSum(sum, example()); };
    tw.addEventListener('input', upd); wb.addEventListener('input', upd);
    tw.setAttribute('autofocus', '');
    frame({
      title: 'Your weights',
      lead: 'Use the numbers your unit gave you. You can change them for a single session, or here whenever your unit updates them.',
      back: prev,
      body: h('div', { class: 'form' },
        h('div', { class: 'grid2' },
          field({ label: 'Dry weight', unit: 'kg', input: tw, hint: 'Also called target weight.' }),
          field({ label: 'Washback', unit: 'kg', input: wb, hint: 'Fluid returned at the end.' })),
        h('div', { class: 'section' },
          h('p', { class: 'label' }, 'How the app works out what to take off'),
          h('p', { class: 'hint' }, 'Here’s an example if you weighed in 1.5 kg over your dry weight.'),
          sum)),
      primary: btn('Continue', next),
      secondary: btn('Skip for now', next, 'btn ghost'),
    });
    setTimeout(() => tw.focus(), 60);
  }

  // ---------- supplies ----------
  function supplies() {
    const list = h('div', { class: 'supply-pick' });
    const drawList = () => list.replaceChildren(...state.supplies.map(supplyRow));
    function supplyRow(sup) {
      const cb = h('input', { type: 'checkbox' }); cb.checked = sup.on;
      const qty = numberInput(sup.qty, { decimal: true }); qty.setAttribute('aria-label', `${sup.name}: how many`);
      const freq = h('select', { 'aria-label': `${sup.name}: how often` },
        h('option', { value: 'session' }, 'each session'),
        h('option', { value: 'week' }, 'each week'),
        h('option', { value: 'month' }, 'each month'));
      freq.value = sup.freq;
      const stock = numberInput(sup.stock, { placeholder: '–' }); stock.setAttribute('aria-label', `${sup.name}: how many you have now`);
      qty.addEventListener('input', () => { sup.qty = readNum(qty); });
      freq.addEventListener('change', () => { sup.freq = freq.value; });
      stock.addEventListener('input', () => { sup.stock = readNum(stock); });
      const detail = h('div', { class: 'pick-detail' },
        h('div', { class: 'use' }, qty, freq),
        h('label', { class: 'have' }, h('span', null, 'Have now'), stock));
      const row = h('div', { class: 'pick' + (sup.on ? ' on' : '') },
        h('label', { class: 'pick-name' }, cb, h('span', null, sup.name, sup.custom ? h('small', null, 'Added by you') : null)),
        detail);
      cb.addEventListener('change', () => { sup.on = cb.checked; row.classList.toggle('on', sup.on); });
      return row;
    }
    drawList();

    const newName = h('input', { type: 'text', placeholder: 'For example Aranesp', autocomplete: 'off' });
    const add = () => {
      const n = newName.value.trim(); if (!n) { newName.focus(); return; }
      state.supplies.push({ name: n, unit: 'each', freq: 'session', qty: 1, on: true, stock: null, custom: true });
      newName.value = '';
      drawList();
      list.lastChild.querySelector('.use input').focus();
    };
    newName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const picked = () => state.supplies.filter(s => s.on).length;
    frame({
      title: 'Your supplies',
      lead: 'Tick what you use and how many. Each session you log takes these off your stock. “Have now” is optional: you can count later.',
      back: prev,
      body: h('div', { class: 'form' },
        h('p', { class: 'hint' }, `“Each week” items are used at your ${M.dayName(state.weeklyDay)} session. “Each month” items are used when you tick Monthly change done, for example water filters.`),
        list,
        h('div', { class: 'weigh' }, field({ label: 'Add your own', input: newName }), h('button', { type: 'button', class: 'btn', onclick: add }, 'Add'))),
      primary: btn(`Finish setup`, async e => {
        e.currentTarget.disabled = true;
        await finish();
      }),
    });
  }

  async function finish() {
    await M.saveSettings({
      name: state.name.trim(), dialysisDays: state.dialysisDays, weeklyDay: state.weeklyDay,
      targetWeight: state.targetWeight, washback: state.washback, onboarded: true,
    });
    const chosen = state.supplies.filter(s => s.on && s.name).map((s, i) => M.itemFromChoice(s, i));
    if (chosen.length) await db.put('item', chosen);
    go('done');
  }

  // ---------- done ----------
  function done() {
    const uncounted = state.supplies.filter(s => s.on && (s.stock === null || s.stock === undefined)).length;
    frame({
      title: 'You’re set up',
      lead: 'Here’s how a session works.',
      body: h('div', { class: 'form' },
        h('ol', { class: 'promise steps' },
          h('li', null, h('b', null, 'Start'), h('span', null, 'Weigh in and take your blood pressure. The app works out what to take off.')),
          h('li', null, h('b', null, 'While you dialyse'), h('span', null, 'Add notes whenever something happens, like an alarm or a change to blood flow.')),
          h('li', null, h('b', null, 'Complete'), h('span', null, 'Weigh out, take your blood pressure again and add the figures from the machine.'))),
        uncounted ? h('p', { class: 'hint' }, `${uncounted} supplies haven’t been counted yet. Do a stock count from Supplies when you’re ready.`) : null),
      primary: btn('Go to Today', onDone),
    });
  }

  draw();
}
