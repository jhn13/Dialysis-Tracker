import { h, openSheet, field, numberInput, readNum, toast, confirmBox, icon } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';

function plural(n, unit) {
  if (!unit || unit === 'each') return `${M.fmt(n)} in stock`;
  if (Math.abs(n) === 1) return `${M.fmt(n)} ${unit}`;
  return `${M.fmt(n)} ${unit}${/(s|x|ch|sh)$/.test(unit) ? 'es' : 's'}`;
}
const weeks = w => w === null ? '' : w < 0.05 ? 'none left' : `${w < 10 ? w.toFixed(1) : Math.round(w)} week${Math.abs(w - 1) < .05 ? '' : 's'} left`;

function unitWord(n, unit) {
  if (!unit || unit === 'each' || n === 1) return unit || '';
  return unit + (/(s|x|ch|sh)$/.test(unit) ? 'es' : 's');
}

function badge(status) { return status === 'none' ? null : h('span', { class: 'badge ' + status }, M.STATUS_LABEL[status]); }

export function openItem(item) {
  const it = item ? { ...item } : { name: '', unit: 'each', perSession: 1, perWeekly: 0, perFilterChange: 0, openingStock: 0, openingDate: M.todayISO(), trackStock: true, order: M.items().length };
  const isNew = !it.id;
  const st = M.settings();
  const name = h('input', { type: 'text', value: it.name, autofocus: isNew, autocomplete: 'off' });
  const unit = h('input', { type: 'text', value: it.unit || '', placeholder: 'each, box, canister', autocomplete: 'off' });
  const ps = numberInput(it.perSession), pw = numberInput(it.perWeekly), pf = numberInput(it.perFilterChange);
  const open = numberInput(it.openingStock), openDate = h('input', { type: 'date', value: it.openingDate || M.todayISO() });
  const track = h('input', { type: 'checkbox', role: 'switch' }); track.checked = it.trackStock !== false;
  const err = h('p', { class: 'err', role: 'alert' });
  const body = h('div', { class: 'form' },
    field({ label: 'Item', input: name }), field({ label: 'Counted in', input: unit }),
    h('fieldset', null, h('legend', null, 'How many you use'),
      h('div', { class: 'grid3' },
        field({ label: 'Every session', input: ps }),
        field({ label: `Extra on ${M.dayName(st.weeklyDay).slice(0, 3)}`, input: pw }),
        field({ label: 'Filter change', input: pf }))),
    h('div', { class: 'grid2' }, field({ label: 'Starting stock', input: open }), field({ label: 'Counted on', input: openDate })),
    h('p', { class: 'hint' }, 'Sessions and deliveries from this date onwards are added to or taken off the starting stock. Use Count stock later to correct it.'),
    h('label', { class: 'toggle' }, h('span', null, 'Warn me when it runs low', h('small', null, 'Turn off for things your unit gives you')), track),
    err,
    !isNew ? h('button', { type: 'button', class: 'btn ghost', style: { color: 'var(--art)', justifySelf: 'start' }, onclick: del }, 'Delete this item') : null);
  const saveBtn = h('button', { type: 'button', class: 'btn primary' }, isNew ? 'Add item' : 'Save changes');
  saveBtn.addEventListener('click', async () => {
    if (!name.value.trim()) { err.textContent = 'Give the item a name.'; return; }
    await db.put('item', { ...it, name: name.value.trim(), unit: unit.value.trim(), perSession: readNum(ps) || 0, perWeekly: readNum(pw) || 0, perFilterChange: readNum(pf) || 0, openingStock: readNum(open) || 0, openingDate: openDate.value || M.todayISO(), trackStock: track.checked });
    sheet.close(); toast(isNew ? 'Item added' : 'Item saved');
  });
  async function del() {
    if (!(await confirmBox({ title: `Delete ${it.name}?`, message: 'The item and its deliveries and stock counts will be removed.', confirm: 'Delete item', danger: true }))) return;
    const linked = [...M.deliveries(), ...M.stockChecks()].filter(x => x.itemId === it.id).map(x => x.id);
    await db.remove([it.id, ...linked]); sheet.close(); toast('Item deleted');
  }
  const sheet = openSheet({ title: isNew ? 'New item' : it.name, body, footer: [saveBtn] });
}

// One form for a whole delivery, or a whole stock count.
function openQuantities(mode) {
  const ctx = M.stockContext();
  const its = M.items();
  const date = h('input', { type: 'date', value: M.todayISO() });
  const inputs = new Map();
  const lines = its.map(it => {
    const s = M.stockFor(it, ctx);
    const inp = numberInput(null, { placeholder: mode === 'count' ? M.fmt(s.current) : '0' });
    inp.setAttribute('aria-label', `${it.name}, ${mode === 'count' ? 'counted' : 'received'}`);
    inputs.set(it.id, inp);
    return h('div', { class: 'qty-line' },
      h('div', { class: 'n' }, it.name, h('small', null, mode === 'count' ? `App says ${plural(s.current, it.unit)}` : (s.orderQty ? `Ordered about ${M.fmt(s.orderQty)}` : plural(s.current, it.unit) + ' now'))),
      inp);
  });
  const body = h('div', { class: 'form' },
    field({ label: mode === 'count' ? 'Counted on' : 'Delivered on', input: date }),
    h('p', { class: 'hint' }, mode === 'count' ? 'Enter what you actually have. Leave a line blank to keep the app’s number.' : 'Enter how many of each arrived. Leave the rest blank.'),
    h('div', { class: 'panel pad qty-list' }, lines));
  const btn = h('button', { type: 'button', class: 'btn primary' }, mode === 'count' ? 'Save count' : 'Save delivery');
  btn.addEventListener('click', async () => {
    const recs = [];
    for (const [itemId, inp] of inputs) {
      const v = readNum(inp);
      if (v === null) continue;
      recs.push(mode === 'count' ? { date: date.value, itemId, counted: v } : { date: date.value, itemId, qty: v });
    }
    if (!recs.length) { toast('Nothing entered'); return; }
    await db.put(mode === 'count' ? 'stockcheck' : 'delivery', recs);
    sheet.close();
    toast(mode === 'count' ? 'Stock count saved' : 'Delivery saved');
  });
  const sheet = openSheet({ title: mode === 'count' ? 'Count stock' : 'Log a delivery', body, footer: [btn] });
}

export function openOrderList() {
  const ctx = M.stockContext();
  const st = ctx.st;
  const rows = M.items().map(it => ({ it, s: M.stockFor(it, ctx) })).filter(x => x.it.trackStock !== false && x.s.orderQty > 0);
  const text = rows.map(({ it, s }) => `${it.name}: ${M.fmt(s.orderQty)}${it.unit && it.unit !== 'each' ? ' ' + unitWord(s.orderQty, it.unit) : ''}`).join('\n');
  const body = h('div', { class: 'form' },
    h('p', { class: 'lead' }, rows.length ? `Enough to last about ${Math.round(st.orderToWeeks)} weeks at your usual ${st.sessionsPerWeek} sessions a week.` : 'Nothing to order. Everything has enough stock to last the order period.'),
    rows.length ? h('div', { class: 'panel rows' }, rows.map(({ it, s }) => h('div', { class: 'row', style: { cursor: 'default' } },
      h('span', { class: 't' }, it.name), h('span', { class: 's' }, `${plural(s.current, it.unit)} now, ${weeks(s.weeksLeft)}`),
      h('span', { class: 'v' }, M.fmt(s.orderQty), h('small', null, unitWord(s.orderQty, it.unit)))))) : null);
  const footer = [];
  if (rows.length) {
    const copy = h('button', { type: 'button', class: 'btn primary' }, navigator.share ? 'Share list' : 'Copy list');
    copy.addEventListener('click', async () => {
      const msg = `Supplies order\n${text}`;
      try {
        if (navigator.share) await navigator.share({ text: msg });
        else { await navigator.clipboard.writeText(msg); toast('List copied'); }
      } catch (e) { if (e.name !== 'AbortError') { await navigator.clipboard.writeText(msg).catch(() => {}); toast('List copied'); } }
    });
    footer.push(copy);
  }
  openSheet({ title: 'Order list', body, footer });
}

export function render(main) {
  const its = M.items();
  if (!its.length) {
    const starter = h('button', { type: 'button', class: 'btn primary' }, 'Add common items');
    starter.addEventListener('click', async () => { await db.put('item', M.STARTER_ITEMS); toast('Common items added. Set your starting stock for each.'); });
    main.replaceChildren(h('div', { class: 'panel empty' },
      h('p', null, 'Track the supplies you use. Each session you log takes its items off your stock, and the app tells you when to order.'),
      h('div', { class: 'btn-row' }, starter, h('button', { type: 'button', class: 'btn', onclick: () => openItem() }, 'Add an item'))));
    return;
  }
  const ctx = M.stockContext();
  const rows = its.map(it => ({ it, s: M.stockFor(it, ctx) }));
  const now = rows.filter(r => r.s.status === 'now').length, low = rows.filter(r => r.s.status === 'low').length;
  main.replaceChildren(...[
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => openQuantities('delivery') }, 'Log a delivery'),
      h('button', { type: 'button', class: 'btn', onclick: () => openQuantities('count') }, 'Count stock'),
      h('button', { type: 'button', class: 'btn', onclick: openOrderList }, 'Order list')),
    (now || low) ? h('p', { class: 'lead' }, [now ? `${now} to order now` : '', low ? `${low} running low` : ''].filter(Boolean).join(', ') + '.') : null,
    h('div', { class: 'panel rows' }, rows.map(({ it, s }) => h('button', { type: 'button', class: 'row stock-row', onclick: () => openItem(it) },
      h('span', { class: 't' }, it.name),
      h('span', { class: 's' }, plural(s.current, it.unit), s.weeksLeft !== null && it.trackStock !== false ? `, ${weeks(s.weeksLeft)}` : ''),
      h('span', { class: 'v' }, badge(s.status), s.orderQty && s.status !== 'ok' && s.status !== 'none' ? h('small', null, `order ${M.fmt(s.orderQty)}`) : null)))),
    h('button', { type: 'button', class: 'btn ghost', style: { justifySelf: 'start' }, onclick: () => openItem() }, icon('plus'), 'Add an item'),
    h('p', { class: 'hint' }, `Weeks left are based on ${ctx.st.sessionsPerWeek} sessions a week. Change this in Settings.`)].filter(Boolean));
}
