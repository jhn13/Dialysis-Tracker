// Two small charts for the report: weight before/after, and blood pressure before/after.
// Red = before (arterial), blue = after (venous), the same everywhere in the app.
import { h } from './ui.js';
import * as M from './model.js';

const W = 680, H = 240, PAD = { l: 44, r: 16, t: 14, b: 30 };
const RED = '#C8322F', BLUE = '#2C5FA8';

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

function frame(dates, yMin, yMax) {
  const t = d => M.parseISO(d).getTime();
  const x0 = t(dates[0]), x1 = t(dates[dates.length - 1]);
  const { lo, hi, ticks } = niceTicks(yMin, yMax);
  const IN = 14; // keep marks clear of the y-axis labels
  const x = d => dates.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + IN + (t(d) - x0) / (x1 - x0) * (W - PAD.l - PAD.r - 2 * IN);
  const y = v => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  // x labels: first, last, and a few between
  const n = Math.min(5, dates.length);
  const idx = [...new Set(Array.from({ length: n }, (_, i) => Math.round(i * (dates.length - 1) / Math.max(1, n - 1))))];
  const grid = ticks.map(v => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('');
  const yl = ticks.map(v => `<text x="${PAD.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const xl = idx.map(i => `<text x="${x(dates[i])}" y="${H - 8}" text-anchor="${i === 0 && dates.length > 1 ? 'start' : i === dates.length - 1 && dates.length > 1 ? 'end' : 'middle'}">${M.niceDate(dates[i], { day: false })}</text>`).join('');
  return { x, y, base: `<g class="grid">${grid}</g><g class="axis">${yl}${xl}</g>` };
}

function path(points) {
  // Breaks the line where a value is missing.
  let d = '', pen = false;
  for (const p of points) {
    if (p === null) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    pen = true;
  }
  return d;
}

function withHover(wrap, svgEl, xs, tipFor) {
  const tip = h('div', { class: 'tip' });
  wrap.append(tip);
  const cross = svgEl.querySelector('.cross');
  const move = e => {
    const r = svgEl.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    let best = 0;
    xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(xs[best] - px)) best = i; });
    const html = tipFor(best);
    if (!html) { tip.classList.remove('show'); return; }
    tip.innerHTML = html;
    tip.style.left = (xs[best] / W * r.width) + 'px';
    tip.style.top = '20px';
    tip.classList.add('show');
    cross.setAttribute('x1', xs[best]); cross.setAttribute('x2', xs[best]); cross.style.opacity = 1;
  };
  const leave = () => { tip.classList.remove('show'); cross.style.opacity = 0; };
  svgEl.addEventListener('pointermove', move);
  svgEl.addEventListener('pointerdown', move);
  svgEl.addEventListener('pointerleave', leave);
}

export function weightChart(sessions) {
  const ss = [...sessions].filter(s => s.preWeight != null || s.postWeight != null).sort((a, b) => a.date.localeCompare(b.date));
  if (!ss.length) return null;
  const vals = ss.flatMap(s => [s.preWeight, s.postWeight, s.targetWeight]).filter(v => v != null);
  const f = frame(ss.map(s => s.date), Math.min(...vals) - 0.3, Math.max(...vals) + 0.3);
  const pre = ss.map(s => s.preWeight != null ? [f.x(s.date), f.y(s.preWeight)] : null);
  const post = ss.map(s => s.postWeight != null ? [f.x(s.date), f.y(s.postWeight)] : null);
  const tgt = ss.map(s => s.targetWeight != null ? [f.x(s.date), f.y(s.targetWeight)] : null);
  const dots = (pts, c) => pts.filter(Boolean).map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${c}" stroke="#fff" stroke-width="2"/>`).join('');
  const markup = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight before and after each session, with dry weight">
    ${f.base}
    <path class="ref" d="${path(tgt)}" fill="none"/>
    <path d="${path(pre)}" fill="none" stroke="${RED}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${path(post)}" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linejoin="round"/>
    ${dots(pre, RED)}${dots(post, BLUE)}
    <line class="cross" y1="${PAD.t}" y2="${H - PAD.b}" stroke="#48535F" stroke-width="1" style="opacity:0"/>
  </svg>`;
  const wrap = h('div', { class: 'chart', html: markup });
  withHover(wrap, wrap.querySelector('svg'), ss.map(s => f.x(s.date)), i => {
    const s = ss[i];
    return `<b>${M.niceDate(s.date)}</b><br>Before ${M.fmt1(s.preWeight) || '—'} kg<br>After ${M.fmt1(s.postWeight) || '—'} kg<br>Dry weight ${M.fmt1(s.targetWeight) || '—'} kg`;
  });
  return h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Weight')),
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: { background: RED } }), 'Before'),
      h('span', null, h('i', { style: { background: BLUE } }), 'After'),
      h('span', null, h('i', { class: 'dash' }), 'Dry weight')),
    h('div', { class: 'panel pad' }, wrap));
}

// Each session gets two upright bars, diastolic to systolic: before (red) and after (blue).
export function bpChart(sessions) {
  const ss = [...sessions].filter(s => (s.preSys != null && s.preDia != null) || (s.postSys != null && s.postDia != null)).sort((a, b) => a.date.localeCompare(b.date));
  if (!ss.length) return null;
  const vals = ss.flatMap(s => [s.preSys, s.preDia, s.postSys, s.postDia]).filter(v => v != null);
  const f = frame(ss.map(s => s.date), Math.min(...vals) - 5, Math.max(...vals) + 5);
  const gap = ss.length > 1 ? (W - PAD.l - PAD.r) / (ss.length - 1) : 40;
  const bw = Math.max(3, Math.min(8, gap / 3.2));
  const off = bw / 2 + 1;
  const bar = (x, a, b, c) => {
    const y1 = f.y(Math.max(a, b)), y2 = f.y(Math.min(a, b));
    return `<rect x="${(x - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, y2 - y1).toFixed(1)}" rx="${Math.min(4, bw / 2)}" fill="${c}"/>`;
  };
  const bars = ss.map(s => {
    const x = f.x(s.date);
    return (s.preSys != null && s.preDia != null ? bar(x - off, s.preSys, s.preDia, RED) : '') +
      (s.postSys != null && s.postDia != null ? bar(x + off, s.postSys, s.postDia, BLUE) : '');
  }).join('');
  const markup = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Blood pressure before and after each session">
    ${f.base}${bars}
    <line class="cross" y1="${PAD.t}" y2="${H - PAD.b}" stroke="#48535F" stroke-width="1" style="opacity:0"/>
  </svg>`;
  const wrap = h('div', { class: 'chart', html: markup });
  withHover(wrap, wrap.querySelector('svg'), ss.map(s => f.x(s.date)), i => {
    const s = ss[i];
    const v = (a, b) => a != null && b != null ? `${a}/${b}` : '—';
    return `<b>${M.niceDate(s.date)}</b><br>Before ${v(s.preSys, s.preDia)}<br>After ${v(s.postSys, s.postDia)}`;
  });
  return h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Blood pressure at sessions')),
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: { background: RED, height: '10px', width: '6px' } }), 'Before'),
      h('span', null, h('i', { style: { background: BLUE, height: '10px', width: '6px' } }), 'After'),
      h('span', { class: 'muted' }, 'Each bar runs from diastolic up to systolic')),
    h('div', { class: 'panel pad' }, wrap));
}
