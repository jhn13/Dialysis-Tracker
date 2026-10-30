import { h, field, numberInput, readNum } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';
import { sumBlock, update as updateSum } from '../sum.js';
import { openStart, openComplete, sessionRow, notesBlock, timeOf } from './sessions.js';
import { openOrderList } from './supplies.js';

let draftWeight = null; // keeps what you typed if the screen redraws

function since(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

function activeCard(s) {
  const bp = s.preSys != null && s.preDia != null ? `${s.preSys}/${s.preDia}${s.prePulse != null ? `, pulse ${s.prePulse}` : ''}` : 'Not recorded';
  const save = () => db.put('session', s);
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', null, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), s.date === M.todayISO() ? 'Session active' : `Active since ${M.niceDate(s.date)}`),
      h('button', { type: 'button', class: 'link', onclick: () => openStart(s) }, 'Edit start')),
    h('div', { class: 'panel' },
      sumBlock(s),
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Started'), h('dd', null, s.startedAt ? [timeOf(s.startedAt), h('small', null, `${since(s.startedAt)} ago`)] : M.niceDate(s.date))),
        h('div', null, h('dt', null, 'UF goal'), h('dd', null, s.ufGoal != null ? `${M.fmt1(s.ufGoal)} L` : '—')),
        h('div', null, h('dt', null, 'BP before'), h('dd', null, bp))),
      h('div', { class: 'card-notes' }, h('h3', { class: 'label' }, 'Notes'), notesBlock(s, { save })),
      h('div', { class: 'card-foot' },
        h('button', { type: 'button', class: 'btn primary block', onclick: () => openComplete(s) }, 'Complete session'))));
}

function startCard(st, today, doneToday) {
  const isDay = st.dialysisDays.includes(M.weekday(today));
  const next = M.nextDialysisDay(M.addDays(today, 1));
  const inp = numberInput(draftWeight, { decimal: true, placeholder: st.targetWeight != null ? M.fmt1(st.targetWeight) : '' });
  const vals = () => ({ preWeight: draftWeight, washback: st.washback, targetWeight: st.targetWeight });
  const sum = sumBlock(vals());
  inp.addEventListener('input', () => { draftWeight = readNum(inp); updateSum(sum, vals()); });
  const start = h('button', { type: 'button', class: 'btn primary' }, 'Start session');
  start.addEventListener('click', () => {
    const s = M.newSession(today);
    s.preWeight = draftWeight;
    s.ufGoal = M.takeOff(s);
    draftWeight = null;
    openStart(s);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') start.click(); });
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', null, doneToday ? 'Today’s session is complete' : isDay ? 'Dialysis day' : 'No session planned today'),
      (doneToday || !isDay) && next ? h('span', { class: 'muted small' }, `Next: ${M.niceDate(next)}`) : null),
    h('div', { class: 'panel' },
      h('div', { style: { padding: '18px 20px 0' } }, h('div', { class: 'weigh' }, field({ label: 'Weight before', unit: 'kg', input: inp }), start)),
      sum));
}

export function render(main, { go }) {
  const st = M.settings();
  const today = M.todayISO();
  const all = M.sessions();
  const active = all.find(s => s.status === 'in_progress');
  const doneToday = all.some(s => s.date === today && s.status === 'complete');
  const kids = [active ? activeCard(active) : startCard(st, today, doneToday)];

  // Supplies that need attention
  const ctx = M.stockContext();
  const its = M.items().map(it => ({ it, s: M.stockFor(it, ctx) }));
  const now = its.filter(x => x.s.status === 'now'), low = its.filter(x => x.s.status === 'low');
  const uncounted = its.filter(x => x.s.status === 'uncounted');
  if (now.length || low.length) {
    const lead = now.length ? now : low;
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Supplies'), h('button', { type: 'button', class: 'link', onclick: () => go('supplies') }, 'See all')),
      h('button', { type: 'button', class: 'panel notice', style: { border: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }, onclick: openOrderList },
        h('span', { class: 'count' + (now.length ? '' : ' low') }, lead.length),
        h('span', null, h('b', null, now.length ? 'To order now' : 'Running low'), h('br'),
          h('span', { class: 'muted small' }, lead.slice(0, 3).map(x => x.it.name).join(', ') + (lead.length > 3 ? ` and ${lead.length - 3} more` : '')),
          now.length && low.length ? h('span', { class: 'muted small' }, h('br'), `${low.length} more running low`) : null),
        h('span', { class: 'muted small' }, 'Order list'))));
  } else if (uncounted.length) {
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Supplies')),
      h('button', { type: 'button', class: 'panel notice', style: { border: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }, onclick: () => go('supplies') },
        h('span', { class: 'count low' }, uncounted.length),
        h('span', null, h('b', null, 'Not counted yet'), h('br'), h('span', { class: 'muted small' }, 'Count your stock so the app can tell you when to order')),
        h('span', { class: 'muted small' }, 'Count'))));
  }

  const recent = all.filter(s => s !== active).slice(0, 3);
  if (recent.length) {
    kids.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Recent sessions'), h('button', { type: 'button', class: 'link', onclick: () => go('sessions') }, 'See all')),
      h('div', { class: 'panel rows' }, recent.map(sessionRow))));
  }
  main.replaceChildren(...kids);
}
