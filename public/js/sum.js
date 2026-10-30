// The "to take off" sum, written out so the working is always visible.
import { h } from './ui.js';
import { num, fmt1, r2 } from './model.js';

export function sumBlock(values, { inline = false } = {}) {
  const el = h('div', { class: 'sum' + (inline ? ' inline' : ''), 'aria-live': 'polite' });
  update(el, values);
  return el;
}

export function update(el, { preWeight, washback, targetWeight }) {
  const pre = num(preWeight), wb = num(washback) ?? 0, tw = num(targetWeight);
  const ready = pre !== null && tw !== null;
  const result = ready ? r2(pre + wb - tw) : null;
  const term = (cls, v, label) => h('div', { class: 'term ' + cls }, h('b', { class: v === null ? 'pending' : '' }, v === null ? '—' : fmt1(v)), h('span', null, label));
  el.replaceChildren(
    h('div', { class: 'sum-eq' },
      term('pre', pre, 'weight before'),
      h('div', { class: 'op', 'aria-hidden': 'true' }, '+'),
      term('wb', wb, 'washback'),
      h('div', { class: 'op', 'aria-hidden': 'true' }, '−'),
      term('tw', tw, 'target weight')),
    h('div', { class: 'sum-result' },
      h('b', { class: ready ? '' : 'pending' }, ready ? fmt1(result) : '—'),
      h('span', null, 'kg'),
      h('span', { class: 'what' }, tw === null ? 'Set your target weight in Settings' : 'to take off')),
  );
  el.setAttribute('aria-label', ready ? `To take off: ${fmt1(result)} kilograms` : 'To take off: waiting for weights');
}
