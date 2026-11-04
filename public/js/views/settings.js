import { h, field, numberInput, readNum, toast, confirmBox, choiceBox } from '../ui.js';
import * as db from '../db.js';
import * as M from '../model.js';
import * as sync from '../sync.js';
import * as lock from '../lock.js';
import * as X from '../export.js';
import * as theme from '../theme.js';

export async function render(main, { go }) {
  const st = M.settings();
  const save = patch => M.saveSettings(patch);

  const numSetting = (key, label, unit, hint, { decimal = true } = {}) => {
    const inp = numberInput(st[key], { decimal });
    inp.addEventListener('change', () => save({ [key]: readNum(inp) }));
    return field({ label, unit, input: inp, hint });
  };

  // ---- treatment ----
  const name = h('input', { type: 'text', value: st.name, autocomplete: 'name' });
  name.addEventListener('change', () => save({ name: name.value.trim() }));
  const day = h('select', null, st.dialysisDays.map(d => h('option', { value: d }, M.dayName(d))));
  day.value = String(st.weeklyDay);
  day.addEventListener('change', () => save({ weeklyDay: +day.value }));
  const dayChips = h('div', { class: 'chips days' }, M.DAY_ORDER.map(d => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(st.dialysisDays.includes(d)), 'aria-label': M.dayName(d),
    onclick: () => {
      const cur = M.settings().dialysisDays;
      const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d];
      if (!next.length) { toast('Keep at least one dialysis day'); return; }
      save({ dialysisDays: next });
    },
  }, M.dayShort(d))));

  const treatment = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Your treatment')),
    h('div', { class: 'panel pad form' },
      field({ label: 'Your name', input: name, hint: 'Shown at the top of reports for your team.' }),
      h('div', { class: 'grid2' },
        numSetting('targetWeight', 'Dry weight', 'kg'),
        numSetting('washback', 'Washback', 'kg')),
      h('p', { class: 'hint' }, 'Used to fill in each new session. To take off = (weight before + washback) − dry weight.'),
      h('fieldset', null, h('legend', null, 'Dialysis days'), dayChips,
        h('p', { class: 'hint' }, `${st.sessionsPerWeek} session${st.sessionsPerWeek === 1 ? '' : 's'} a week. Used to work out how long supplies last.`)),
      field({ label: 'Weekly items on', input: day, hint: 'Sessions on this day also use your weekly items, such as dressings.' })));

  // ---- appearance ----
  const cur = theme.choice();
  const appearance = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Appearance')),
    h('div', { class: 'panel pad form' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Appearance' },
        [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([k, label]) =>
          h('button', { type: 'button', 'aria-pressed': String(cur === k), onclick: () => theme.set(k) }, label))),
      h('p', { class: 'hint' }, 'Match device follows your phone’s light or dark setting. Saved on this device only.')));

  // ---- fields ----
  const optional = M.SESSION_FIELDS.filter(f => !f.required);
  const phaseName = { start: 'When you start', complete: 'When you complete' };
  const fieldToggles = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'What you record')),
    h('div', { class: 'panel pad' },
      h('p', { class: 'hint', style: { marginBottom: '6px' } }, 'Turn off anything that doesn’t apply to you. It disappears from the session form and from reports.'),
      optional.map(f => {
        const cb = h('input', { type: 'checkbox', role: 'switch' });
        cb.checked = !st.hidden[f.key];
        cb.addEventListener('change', () => save({ hidden: { ...M.settings().hidden, [f.key]: !cb.checked } }));
        return h('label', { class: 'toggle' }, h('span', null, f.group ? `${f.group}: ${f.label.toLowerCase()}` : f.label, h('small', null, phaseName[f.phase])), cb);
      })));

  // ---- given/done options ----
  const optInput = h('input', { type: 'text', placeholder: 'Add, for example Iron infusion' });
  const addOpt = () => {
    const v = optInput.value.trim();
    if (!v || st.givenOptions.includes(v)) return;
    save({ givenOptions: [...M.settings().givenOptions, v] });
    toast(`${v} added`);
  };
  optInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOpt(); } });
  const given = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Given or done')),
    h('div', { class: 'panel pad form' },
      h('p', { class: 'hint' }, 'Quick buttons on the session form for things like injections or dressing changes. Tap one here to remove it.'),
      h('div', { class: 'chips' }, st.givenOptions.map(o => h('button', { type: 'button', class: 'chip', 'aria-label': `Remove ${o}`, onclick: () => save({ givenOptions: M.settings().givenOptions.filter(x => x !== o) }) }, o, '  ×'))),
      h('div', { class: 'weigh' }, field({ label: 'New button', input: optInput }), h('button', { type: 'button', class: 'btn', onclick: addOpt }, 'Add'))));

  // ---- supplies ----
  const supplies = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Supplies')),
    h('div', { class: 'panel pad form' },
      h('div', { class: 'grid2' },
        numSetting('orderNowWeeks', '“Order now” under', 'weeks'),
        numSetting('lowWeeks', '“Running low” under', 'weeks')),
      h('div', { class: 'grid2' },
        numSetting('orderToWeeks', 'Order enough for', 'weeks'),
        numSetting('filterEveryWeeks', 'Monthly change every', 'weeks')),
      h('p', { class: 'hint' }, '4.33 weeks is one month.')));

  // ---- account ----
  const account = h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Account and sync')));
  const accPanel = h('div', { class: 'panel pad form' });
  account.append(accPanel);
  if (!sync.configured) {
    accPanel.append(h('p', { class: 'lead' }, 'Your records are saved on this device only. Connect Supabase (see the setup guide) to sign in, sync between devices and use Face ID.'));
  } else if (!sync.state.user) {
    accPanel.append(h('p', { class: 'lead' }, 'Not signed in. Records stay on this device until you sign in.'),
      h('button', { type: 'button', class: 'btn primary', style: { justifySelf: 'start' }, onclick: () => go('signin') }, 'Sign in'));
  } else {
    const when = sync.state.lastSync ? new Date(sync.state.lastSync).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
    const syncBtn = h('button', { type: 'button', class: 'btn' }, 'Sync now');
    syncBtn.addEventListener('click', async () => { syncBtn.disabled = true; await sync.syncNow(); syncBtn.disabled = false; toast(sync.state.status === 'idle' ? 'Up to date' : 'Couldn’t sync. It will try again.'); });
    const out = h('button', { type: 'button', class: 'btn ghost' }, 'Sign out');
    out.addEventListener('click', async () => {
      const ok = await confirmBox({ title: 'Sign out?', message: 'Your records stay safe in your account. They’re removed from this device until you sign in again.', confirm: 'Sign out' });
      if (!ok) return;
      await sync.signOut({ removeData: true });
      location.hash = '#signin'; location.reload();
    });
    accPanel.append(
      h('p', null, h('b', null, sync.state.user.email)),
      h('p', { class: 'hint' }, `Last synced ${when}.${sync.pending() ? ` ${sync.pending()} change${sync.pending() === 1 ? '' : 's'} waiting to send.` : ''}`),
      sync.state.status === 'error' ? h('p', { class: 'err' }, 'Sync problem: ' + sync.state.error) : null);

    if (await lock.available()) {
      const cb = h('input', { type: 'checkbox', role: 'switch' });
      cb.checked = await lock.enabledHere();
      cb.addEventListener('change', async () => {
        try {
          if (cb.checked) { await lock.enable(sync.state.user.email); toast('Face ID unlock is on for this device'); }
          else { await lock.unlock(); await lock.disable(); toast('Face ID unlock is off'); }
        } catch (e) { cb.checked = !cb.checked; toast('Face ID was cancelled'); }
      });
      accPanel.append(h('label', { class: 'toggle' }, h('span', null, 'Unlock with Face ID or Touch ID', h('small', null, 'Asked each time you open the app on this device')), cb));
    }
    accPanel.append(h('div', { class: 'btn-row' }, syncBtn, out));
  }

  // ---- backup ----
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const r = await X.restoreBackup(f, { ask: info => X.askAboutSupplies(info, choiceBox) });
      if (r.cancelled) toast('Nothing restored');
      else toast(r.applied ? `Restored ${r.applied} record${r.applied === 1 ? '' : 's'}${r.sessions ? `, including ${r.sessions} sessions` : ''}` : 'Everything in that backup is already here');
    } catch (e) { toast(e.message); }
    fileIn.value = '';
  });
  const backup = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Backup')),
    h('div', { class: 'panel pad form' },
      h('p', { class: 'hint' }, 'A backup holds everything: sessions, readings, supplies and settings. Restoring adds anything missing and keeps the newest version of each record.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => X.downloadBackup() }, 'Download backup'),
        h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, 'Restore from backup')),
      fileIn,
      !sync.state.user ? h('button', { type: 'button', class: 'btn ghost', style: { color: 'var(--art)', justifySelf: 'start' }, onclick: async () => {
        if (await confirmBox({ title: 'Delete everything on this device?', message: 'All sessions, readings, supplies and settings on this device will be deleted. Download a backup first if you want to keep them.', confirm: 'Delete everything', danger: true })) { await db.wipe(); toast('Everything deleted'); go('today'); }
      } }, 'Delete everything on this device') : null));

  main.replaceChildren(treatment, appearance, fieldToggles, given, supplies, account, backup,
    h('p', { class: 'hint', style: { textAlign: 'center' } }, 'Dialysis Tracker, test version 0.1. For keeping records only. It doesn’t give medical advice.'));
}
