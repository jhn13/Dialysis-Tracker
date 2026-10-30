import { h, field, numberInput, readNum } from '../ui.js';
import * as M from '../model.js';
import { sumBlock, update as updateSum } from '../sum.js';
import { openSession, sessionRow } from './sessions.js';
import { openReading } from './bp.js';
import { openOrderList } from './supplies.js';

let draftWeight = null; // keeps what you typed if the screen redraws

export function render(main, { go }) {
  const st = M.settings();
  const today = M.todayISO();
  const all = M.sessions();
  const inProgress = all.find(s => s.status === 'in_progress');
  const doneToday = all.filter(s => s.date === today && s.status === 'complete');
  const kids = [];

  if (inProgress) {
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, inProgress.date === today ? 'Session in progress' : `Unfinished session from ${M.niceDate(inProgress.date)}`)),
      h('div', { class: 'panel' },
        sumBlock(inProgress),
        h('div', { style: { padding: '0 20px 20px' }, class: 'btn-row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => openSession(inProgress) }, 'Continue session')))));
  } else {
    const inp = numberInput(draftWeight, { decimal: true, placeholder: st.targetWeight != null ? M.fmt1(st.targetWeight) : '' });
    const sum = sumBlock({ preWeight: draftWeight, washback: st.washback, targetWeight: st.targetWeight });
    inp.addEventListener('input', () => { draftWeight = readNum(inp); updateSum(sum, { preWeight: draftWeight, washback: st.washback, targetWeight: st.targetWeight }); });
    const start = h('button', { type: 'button', class: 'btn primary' }, 'Start session');
    start.addEventListener('click', () => {
      const s = M.newSession(today);
      s.preWeight = draftWeight;
      s.ufGoal = M.takeOff(s);
      draftWeight = null;
      openSession(s, { phase: 'before' });
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') start.click(); });
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, doneToday.length ? 'Another session' : 'Weigh in')),
      h('div', { class: 'panel' },
        h('div', { style: { padding: '18px 20px 0' } }, h('div', { class: 'weigh' }, field({ label: 'Weight before', unit: 'kg', input: inp }), start)),
        sum)));
  }

  // Supplies that need attention
  const ctx = M.stockContext();
  const its = M.items().map(it => ({ it, s: M.stockFor(it, ctx) }));
  const now = its.filter(x => x.s.status === 'now'), low = its.filter(x => x.s.status === 'low');
  if (now.length || low.length) {
    const lead = now.length ? now : low;
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Supplies'), h('button', { type: 'button', class: 'link', onclick: () => go('supplies') }, 'See all')),
      h('button', { type: 'button', class: 'panel notice', style: { border: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }, onclick: openOrderList },
        h('span', { class: 'count' + (now.length ? '' : ' low') }, lead.length),
        h('span', null, h('b', null, now.length ? `To order now` : 'Running low'), h('br'),
          h('span', { class: 'muted small' }, lead.slice(0, 3).map(x => x.it.name).join(', ') + (lead.length > 3 ? ` and ${lead.length - 3} more` : '')),
          now.length && low.length ? h('span', { class: 'muted small' }, h('br'), `${low.length} more running low`) : null),
        h('span', { class: 'muted small' }, 'Order list'))));
  }

  // Quick BP
  const lastBp = M.bpReadings()[0];
  kids.push(h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Blood pressure'), h('button', { type: 'button', class: 'link', onclick: () => go('bp') }, 'See all')),
    h('div', { class: 'panel rows' },
      h('button', { type: 'button', class: 'row', onclick: () => openReading() },
        h('span', { class: 't' }, 'Add a reading'),
        h('span', { class: 's' }, lastBp ? `Last: ${lastBp.sys}/${lastBp.dia} on ${M.niceDate(lastBp.date)}${lastBp.time ? ' at ' + lastBp.time : ''}` : 'Readings between sessions'),
        h('span', { class: 'v', style: { fontSize: '26px', color: 'var(--ink-2)' }, 'aria-hidden': 'true' }, '+')))));

  // Recent sessions
  const recent = all.filter(s => s !== inProgress).slice(0, 3);
  if (recent.length) {
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Recent sessions'), h('button', { type: 'button', class: 'link', onclick: () => go('sessions') }, 'See all')),
      h('div', { class: 'panel rows' }, recent.map(sessionRow))));
  }

  if (st.targetWeight == null) {
    kids.unshift(h('div', { class: 'panel pad', style: { display: 'grid', gap: '12px' } },
      h('p', null, h('b', null, 'Set up your treatment first. '), 'Add your target weight, washback and sessions per week, so the app can work out what to take off and how long your supplies will last.'),
      h('button', { type: 'button', class: 'btn primary', style: { justifySelf: 'start' }, onclick: () => go('settings') }, 'Open Settings')));
  }
  main.replaceChildren(...kids);
}
