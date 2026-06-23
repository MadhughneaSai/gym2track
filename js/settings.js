// Shared Settings sheet — opened from the gear button in every panel header.
// Profile + sign out · theme switcher · demo-data toggle · backup/erase.

import { GLYPHS } from './icons.js';
import {
  isMock, setMockMode, exportJSON, importJSON, clearAll, todayKey,
  weightStep, setWeightStep,
} from './state.js';
import { isConfigured, currentUser, signOutUser } from './cloud.js';
import { openSheet, closeSheet, toast, applyTheme } from './app.js';
import { resetCoachMemory, exportCoachData, openCoachKnowledge } from './coach.js';

const THEMES = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];
function currentTheme() {
  try { return localStorage.getItem('workout:theme') || 'dark'; } catch { return 'dark'; }
}

export function initSettings() {
  document.querySelectorAll('[data-settings]').forEach(btn =>
    btn.addEventListener('click', openSettings));
}

export function openSettings() {
  const user = isConfigured ? currentUser() : null;
  const initial = (user?.displayName || user?.email || '?').trim()[0]?.toUpperCase() || '?';

  const profile = user ? `
    <div class="account-row">
      <div class="account-avatar">${user.photoURL ? `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer">` : initial}</div>
      <div class="account-id">
        <div class="account-name">${esc(user.displayName || user.email || 'Signed in')}</div>
        <div class="account-mail">${user.displayName && user.email ? esc(user.email) : 'Synced across your devices'}</div>
      </div>
      <button class="account-out" id="s-signout">Sign out</button>
    </div>` : (isConfigured ? '' : `
    <div class="set-note">Saved on this device. Sign-in &amp; cloud sync aren't set up.</div>`);

  const themeSeg = THEMES.map(t =>
    `<button class="set-opt${t.id === currentTheme() ? ' is-active' : ''}" data-theme="${t.id}">${t.name}</button>`).join('');

  const stepNow = weightStep();
  const stepSeg = [5, 2.5].map(v =>
    `<button class="set-opt${v === stepNow ? ' is-active' : ''}" data-step="${v}">${v} lb</button>`).join('');

  const sheet = openSheet(`
    <h3>Settings</h3>
    ${profile}
    <div class="set-row">
      <div class="set-label"><div class="set-title">Theme</div></div>
      <div class="set-seg" id="s-theme">${themeSeg}</div>
    </div>
    <div class="set-row">
      <div class="set-label">
        <div class="set-title">Weight steps</div>
        <div class="set-desc">+/− increment when logging. Doesn't change any sets you've already saved.</div>
      </div>
      <div class="set-seg" id="s-step">${stepSeg}</div>
    </div>
    <div class="set-row">
      <div class="set-label">
        <div class="set-title">Demo data</div>
        <div class="set-desc">Preview with sample workouts. Kept separate — your real data is never changed.</div>
      </div>
      <button class="set-toggle${isMock() ? ' on' : ''}" id="s-demo" role="switch" aria-checked="${isMock()}"><span class="set-knob"></span></button>
    </div>
    <div class="set-divider"></div>
    <div class="sheet-sub">Back up your data now and then — it lives on this device${user ? ' and your account' : ''}.</div>
    <button class="sheet-action" id="s-export">Export workout data (JSON)</button>
    <button class="sheet-action" id="s-import">Import workout data</button>
    <input type="file" id="s-file" accept="application/json,.json" hidden>
    <button class="sheet-action" id="s-coach-knows">What your coach knows</button>
    <button class="sheet-action" id="s-export-coach">Export coach data (JSON)</button>
    <button class="sheet-action" id="s-reset-coach">Reset coach memory</button>
    <button class="sheet-action danger" id="s-clear">Erase ${isMock() ? 'demo data' : 'everything'}</button>`);

  // show the durable facts the coach uses across every chat (with per-fact delete)
  sheet.querySelector('#s-coach-knows').addEventListener('click', () => openCoachKnowledge());

  // export the coach's memory profile + chat thread as a backup file
  sheet.querySelector('#s-export-coach').addEventListener('click', async () => {
    try { const r = await exportCoachData(); toast(`Coach data exported (${r.memories} memories)`); }
    catch (e) { console.error('export coach', e); toast('Could not export coach data'); }
  });

  // reset the AI coach: clears the on-device chat AND the server-side memory profile
  sheet.querySelector('#s-reset-coach').addEventListener('click', async () => {
    if (!confirm('Reset the coach? This clears your chat history and everything it has learned about you. Your workout log is not affected.')) return;
    try { await resetCoachMemory(); toast('Coach memory reset'); }
    catch (e) { console.error('reset coach', e); toast('Could not reset — check connection'); }
    closeSheet();
  });

  // theme — live swap (just flips CSS variables on <html>), no reload
  sheet.querySelectorAll('#s-theme .set-opt').forEach(b => b.addEventListener('click', () => {
    applyTheme(b.dataset.theme);
    sheet.querySelectorAll('#s-theme .set-opt').forEach(x => x.classList.toggle('is-active', x === b));
  }));

  // weight steps — affects only the +/− increment for future logging; never touches saved sets
  sheet.querySelectorAll('#s-step .set-opt').forEach(b => b.addEventListener('click', () => {
    const v = setWeightStep(parseFloat(b.dataset.step));
    sheet.querySelectorAll('#s-step .set-opt').forEach(x => x.classList.toggle('is-active', x === b));
    toast(`Logging in ${v} lb steps`);
  }));

  // demo toggle — local sandbox; never touches real or cloud data
  const demo = sheet.querySelector('#s-demo');
  demo.addEventListener('click', () => {
    const on = setMockMode(!isMock()) === 'mock';
    demo.classList.toggle('on', on);
    demo.setAttribute('aria-checked', String(on));
    toast(on ? 'Showing demo data' : 'Back to your data');
    closeSheet();
  });

  if (user) sheet.querySelector('#s-signout').addEventListener('click', () => {
    signOutUser();
    closeSheet();
  });

  sheet.querySelector('#s-export').addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workout-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  });

  const file = sheet.querySelector('#s-file');
  sheet.querySelector('#s-import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { importJSON(await file.files[0].text()); toast('Backup imported'); closeSheet(); }
    catch { toast('That file is not a valid backup'); }
  });

  sheet.querySelector('#s-clear').addEventListener('click', () => {
    const what = isMock() ? 'the demo data' : (currentUser() ? 'ALL data in your account' : 'ALL your workout data');
    if (confirm(`Erase ${what}?`) && (isMock() || confirm('Really sure? There is no undo.'))) {
      clearAll();
      toast(isMock() ? 'Demo data cleared' : 'All data erased');
      closeSheet();
    }
  });
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
