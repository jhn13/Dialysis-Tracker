// What gets recorded, and the sums the app does with it.
import * as db from './db.js';

// ---------- session fields ----------
// phase: before | during | after. "required" fields can't be hidden in Settings.
export const SESSION_FIELDS = [
  { key: 'targetWeight', label: 'Dry weight', unit: 'kg', phase: 'start', decimal: true },
  { key: 'washback', label: 'Washback', unit: 'kg', phase: 'start', decimal: true },
  { key: 'preWeight', label: 'Weight before', unit: 'kg', phase: 'start', decimal: true, required: true },
  { key: 'ufGoal', label: 'UF goal', unit: 'L', phase: 'start', decimal: true },
  { key: 'preSys', label: 'Systolic', unit: 'mmHg', phase: 'start', group: 'Blood pressure before' },
  { key: 'preDia', label: 'Diastolic', unit: 'mmHg', phase: 'start', group: 'Blood pressure before' },
  { key: 'prePulse', label: 'Pulse', unit: 'bpm', phase: 'start', group: 'Blood pressure before' },
  { key: 'postWeight', label: 'Weight after', unit: 'kg', phase: 'complete', decimal: true },
  { key: 'postSys', label: 'Systolic', unit: 'mmHg', phase: 'complete', group: 'Blood pressure after' },
  { key: 'postDia', label: 'Diastolic', unit: 'mmHg', phase: 'complete', group: 'Blood pressure after' },
  { key: 'postPulse', label: 'Pulse', unit: 'bpm', phase: 'complete', group: 'Blood pressure after' },
  { key: 'ufAchieved', label: 'UF achieved', unit: 'L', phase: 'complete', decimal: true },
  { key: 'bloodFlow', label: 'Blood flow achieved', unit: 'ml/min', phase: 'complete' },
  { key: 'bloodVolume', label: 'Blood volume processed', unit: 'L', phase: 'complete', decimal: true },
];
export const FIELD = Object.fromEntries(SESSION_FIELDS.map(f => [f.key, f]));

export const DEFAULT_SETTINGS = {
  name: '',
  targetWeight: null,
  washback: null,
  dialysisDays: [1, 3, 5], // 0 Sun .. 6 Sat
  sessionsPerWeek: 3,      // kept in step with dialysisDays
  weeklyDay: 1,            // sessions on this day use the weekly items
  orderNowWeeks: 2,        // "Order now" when less than this many weeks left
  lowWeeks: 4.33,          // "Running low" when less than this (4.33 weeks = a month)
  orderToWeeks: 4.33,      // order enough to last this long
  filterEveryWeeks: 4.33,  // how often the monthly change (filters etc.) happens
  hidden: {},
  givenOptions: ['Aranesp', 'Dressing changed'],
  lockEnabled: false,
};

export function settings() {
  const s = db.get('settings');
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  out.hidden = { ...DEFAULT_SETTINGS.hidden, ...((s && s.hidden) || {}) };
  if (!Array.isArray(out.dialysisDays) || !out.dialysisDays.length) out.dialysisDays = DEFAULT_SETTINGS.dialysisDays;
  out.sessionsPerWeek = out.dialysisDays.length;
  delete out.id;
  return out;
}
export function saveSettings(patch) {
  const cur = settings();
  const next = { ...cur, ...patch, id: 'settings' };
  next.dialysisDays = [...new Set(next.dialysisDays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  next.sessionsPerWeek = next.dialysisDays.length;
  if (!next.dialysisDays.includes(next.weeklyDay) && next.dialysisDays.length) next.weeklyDay = next.dialysisDays[0];
  return db.put('settings', next);
}
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// First run: nothing set up yet on this account.
export function needsSetup() {
  return !db.get('settings') && !db.list('session').length && !db.list('item').length;
}
export function visibleFields(phase) {
  const hidden = settings().hidden;
  return SESSION_FIELDS.filter(f => f.phase === phase && (f.required || !hidden[f.key]));
}

// ---------- numbers ----------
export const num = v => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
export const r2 = n => Math.round(n * 100) / 100;
export function fmt(n, dp) {
  if (n === null || n === undefined || isNaN(n)) return '';
  if (dp !== undefined) return (+n).toFixed(dp);
  return String(r2(+n));
}
// Weights: one decimal place, or two if the scales gave two.
export function fmt1(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const s = r2(+n);
  return Math.abs(s * 10 - Math.round(s * 10)) < 1e-6 ? s.toFixed(1) : s.toFixed(2);
}

// To take off = (weight before + washback) − target weight
export function takeOff(s) {
  const pre = num(s.preWeight), wb = num(s.washback) ?? 0, tw = num(s.targetWeight);
  if (pre === null || tw === null) return null;
  return r2(pre + wb - tw);
}

// ---------- dates ----------
export function todayISO(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function nowTime(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${z(d.getHours())}:${z(d.getMinutes())}`;
}
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function weekday(iso) { return parseISO(iso).getDay(); }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayName = i => DAYS_LONG[i];
export const dayShort = i => DAYS[i];
export function nextDialysisDay(fromISO = todayISO()) {
  const days = settings().dialysisDays;
  for (let i = 0; i < 8; i++) { const d = addDays(fromISO, i); if (days.includes(weekday(d))) return d; }
  return null;
}
export function niceDate(iso, { year = false, day = true } = {}) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${day ? DAYS[d.getDay()] + ' ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ' ' + d.getFullYear() : ''}`;
}
export function monthLabel(iso) { const d = parseISO(iso); return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; }
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return todayISO(d); }

// ---------- sessions & BP ----------
export function sessions() {
  return db.list('session').sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')));
}
export function bpReadings() {
  return db.list('bp').sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}
export function isWeeklyDate(iso) { return weekday(iso) === settings().weeklyDay; }
export function sessionDates() { return new Set(sessions().map(s => s.date)); }

export function newSession(date = todayISO()) {
  const st = settings();
  return {
    date,
    status: 'in_progress',
    type: isWeeklyDate(date) ? 'weekly' : 'routine',
    targetWeight: st.targetWeight,
    washback: st.washback,
    filtersChanged: false,
    given: [],
    notes: [],
    comments: '',
    startedAt: new Date().toISOString(),
  };
}

// ---------- supplies ----------
export function items() { return db.list('item').sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name)); }
export const deliveries = () => db.list('delivery').sort((a, b) => b.date.localeCompare(a.date));
export const stockChecks = () => db.list('stockcheck').sort((a, b) => b.date.localeCompare(a.date));

export function weeklyUse(item, st = settings()) {
  const ps = num(item.perSession) || 0, pw = num(item.perWeekly) || 0, pf = num(item.perFilterChange) || 0;
  return ps * st.sessionsPerWeek + pw + (st.filterEveryWeeks > 0 ? pf / st.filterEveryWeeks : 0);
}

function usedBySessions(item, list) {
  const ps = num(item.perSession) || 0, pw = num(item.perWeekly) || 0, pf = num(item.perFilterChange) || 0;
  let used = 0;
  for (const s of list) {
    used += ps;
    if (s.type === 'weekly') used += pw;
    if (s.filtersChanged) used += pf;
  }
  return used;
}

// Current stock: start from the latest stock count (counted at the end of that day)
// or the opening stock (at the start of its day), then add deliveries and take off what sessions used.
export function stockFor(item, ctx) {
  const { allSessions, allDeliveries, allChecks, st } = ctx;
  const checks = allChecks.filter(c => c.itemId === item.id);
  let base, baseDate, inclusive;
  if (checks.length) {
    const c = checks[0];
    base = num(c.counted) || 0; baseDate = c.date; inclusive = false;
  } else {
    if (item.openingStock === null || item.openingStock === undefined || item.openingStock === '') {
      return { current: null, received: 0, used: 0, weeklyUse: weeklyUse(item, st), weeksLeft: null, status: 'uncounted', orderQty: 0 };
    }
    base = num(item.openingStock) || 0; baseDate = item.openingDate || '0000-00-00'; inclusive = true;
  }
  const after = d => inclusive ? d >= baseDate : d > baseDate;
  const received = allDeliveries.filter(d => d.itemId === item.id && after(d.date)).reduce((a, d) => a + (num(d.qty) || 0), 0);
  const used = usedBySessions(item, allSessions.filter(s => after(s.date)));
  const current = r2(base + received - used);
  const wu = weeklyUse(item, st);
  const weeksLeft = wu > 0 ? current / wu : null;
  let status = 'none';
  if (item.trackStock !== false && wu > 0) {
    status = weeksLeft < st.orderNowWeeks ? 'now' : weeksLeft < st.lowWeeks ? 'low' : 'ok';
  }
  const orderQty = wu > 0 ? Math.max(0, Math.ceil(st.orderToWeeks * wu - current - 1e-9)) : 0;
  return { current, received, used, weeklyUse: wu, weeksLeft, status, orderQty };
}

export function stockContext() {
  return { allSessions: sessions(), allDeliveries: deliveries(), allChecks: stockChecks(), st: settings() };
}

export const STATUS_LABEL = { now: 'Order now', low: 'Running low', ok: 'OK', none: '', uncounted: 'Not counted' };

// Offered during setup. [name, unit, how often, how many, ticked by default]
// how often: 'session' (every session), 'week' (on the weekly day), 'month' (when the monthly change is done)
export const COMMON_SUPPLIES = [
  ['Acid concentrate', 'canister', 'session', 1, true],
  ['Bicarbonate cartridge', 'cartridge', 'session', 1, true],
  ['Dialyser', 'unit', 'session', 1, true],
  ['Blood lines', 'set', 'session', 1, true],
  ['On/off sterile packs', 'pack', 'session', 2, true],
  ['Prefilled flush syringes', 'each', 'session', 4, true],
  ['10ml syringes', 'each', 'session', 2, true],
  ['2ml syringes', 'each', 'session', 2, true],
  ['Heparin', 'each', 'session', 1, true],
  ['Sterile gloves', 'pair', 'session', 2, true],
  ['Fistula needles', 'each', 'session', 2, false],
  ['Saline bags', 'bag', 'session', 1, false],
  ['Alcohol wipes', 'each', 'session', 4, false],
  ['Dressings', 'each', 'week', 1, true],
  ['Dressing applicators', 'each', 'week', 1, false],
  ['Needle-free connectors', 'each', 'week', 2, false],
  ['Carbon filter', 'each', 'month', 1, true],
  ['Micron filter', 'each', 'month', 1, true],
  ['Water softener salt', 'bag', 'month', 1, false],
];
export function itemFromChoice({ name, unit, freq, qty, stock }, order) {
  const q = num(qty) || 0;
  return {
    name, unit, order, trackStock: true, openingDate: todayISO(),
    openingStock: stock === null || stock === undefined || stock === '' ? null : num(stock),
    perSession: freq === 'session' ? q : 0, perWeekly: freq === 'week' ? q : 0, perFilterChange: freq === 'month' ? q : 0,
  };
}
export function itemFrequency(it) {
  if (num(it.perSession)) return { freq: 'session', qty: num(it.perSession) };
  if (num(it.perWeekly)) return { freq: 'week', qty: num(it.perWeekly) };
  if (num(it.perFilterChange)) return { freq: 'month', qty: num(it.perFilterChange) };
  return { freq: 'session', qty: 0 };
}
export const STARTER_ITEMS = COMMON_SUPPLIES.filter(c => c[4]).map(([name, unit, freq, qty], i) => itemFromChoice({ name, unit, freq, qty, stock: null }, i));

// Notes on a session: older records have one "comments" text, newer ones a list of timed notes.
export function sessionNotes(s) {
  const out = [];
  if (s.comments) out.push({ at: null, text: s.comments });
  for (const n of s.notes || []) out.push(n);
  return out;
}
export function notesText(s) {
  return sessionNotes(s).map(n => (n.at ? new Date(n.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' ' : '') + n.text).join('. ');
}
export function monthlyItems() { return items().filter(it => num(it.perFilterChange)); }
