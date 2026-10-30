// What gets recorded, and the sums the app does with it.
import * as db from './db.js';

// ---------- session fields ----------
// phase: before | during | after. "required" fields can't be hidden in Settings.
export const SESSION_FIELDS = [
  { key: 'targetWeight', label: 'Target weight', unit: 'kg', phase: 'before', decimal: true },
  { key: 'washback', label: 'Washback', unit: 'kg', phase: 'before', decimal: true },
  { key: 'preWeight', label: 'Weight before', unit: 'kg', phase: 'before', decimal: true, required: true },
  { key: 'ufGoal', label: 'UF goal', unit: 'L', phase: 'before', decimal: true },
  { key: 'preSys', label: 'Systolic', unit: 'mmHg', phase: 'before', group: 'Blood pressure before' },
  { key: 'preDia', label: 'Diastolic', unit: 'mmHg', phase: 'before', group: 'Blood pressure before' },
  { key: 'prePulse', label: 'Pulse', unit: 'bpm', phase: 'before', group: 'Blood pressure before' },
  { key: 'bloodFlow', label: 'Blood flow achieved', unit: 'ml/min', phase: 'during' },
  { key: 'arterialPressure', label: 'Arterial pressure', unit: 'mmHg', phase: 'during', signed: true },
  { key: 'venousPressure', label: 'Venous pressure', unit: 'mmHg', phase: 'during' },
  { key: 'tmp', label: 'TMP', unit: 'mmHg', phase: 'during' },
  { key: 'postWeight', label: 'Weight after', unit: 'kg', phase: 'after', decimal: true },
  { key: 'postSys', label: 'Systolic', unit: 'mmHg', phase: 'after', group: 'Blood pressure after' },
  { key: 'postDia', label: 'Diastolic', unit: 'mmHg', phase: 'after', group: 'Blood pressure after' },
  { key: 'postPulse', label: 'Pulse', unit: 'bpm', phase: 'after', group: 'Blood pressure after' },
  { key: 'ufAchieved', label: 'UF achieved', unit: 'L', phase: 'after', decimal: true },
  { key: 'bloodVolume', label: 'Blood volume processed', unit: 'L', phase: 'after', decimal: true },
];
export const FIELD = Object.fromEntries(SESSION_FIELDS.map(f => [f.key, f]));

export const DEFAULT_SETTINGS = {
  name: '',
  targetWeight: null,
  washback: null,
  sessionsPerWeek: 3,
  weeklyDay: 1,            // 0 Sun .. 6 Sat. Sessions on this day use the weekly extras.
  orderNowWeeks: 2,        // "Order now" when less than this many weeks left
  lowWeeks: 4.33,          // "Running low" when less than this (4.33 weeks = a month)
  orderToWeeks: 4.33,      // order enough to last this long
  filterEveryWeeks: 4.33,  // how often water filters are changed
  hidden: { tmp: true },
  givenOptions: ['Aranesp', 'Dressing changed'],
  lockEnabled: false,
};

export function settings() {
  const s = db.get('settings');
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  out.hidden = { ...DEFAULT_SETTINGS.hidden, ...((s && s.hidden) || {}) };
  delete out.id;
  return out;
}
export function saveSettings(patch) {
  const cur = settings();
  return db.put('settings', { ...cur, ...patch, id: 'settings' });
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

export const STATUS_LABEL = { now: 'Order now', low: 'Running low', ok: 'OK', none: '' };

export const STARTER_ITEMS = [
  ['Acid', 'canister', 1, 0, 0], ['Bicarb', 'cartridge', 1, 0, 0], ['Dialyser', 'unit', 1, 0, 0],
  ['Lines', 'set', 1, 0, 0], ['Needles', 'each', 2, 0, 0], ['On/off sterile kits', 'kit', 2, 0, 0],
  ['Prefilled flush syringes', 'each', 4, 0, 0], ['10ml syringes', 'each', 2, 0, 0], ['Heparin', 'each', 1, 0, 0],
  ['Sterile gloves', 'pair', 2, 0, 0], ['Dressings', 'each', 0, 1, 0], ['Carbon filter', 'each', 0, 0, 1], ['Micron filter', 'each', 0, 0, 1],
].map(([name, unit, perSession, perWeekly, perFilterChange], i) => ({ name, unit, perSession, perWeekly, perFilterChange, openingStock: 0, openingDate: todayISO(), trackStock: true, order: i }));
