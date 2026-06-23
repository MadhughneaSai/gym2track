// Boot: pager <-> dock sync, shared sheet/toast, panel module init.

import { initLog, openEntryFor, openDay } from './log.js';
import { initHistory } from './history.js';
import { initProgress } from './progress.js';
import { initSettings, openSettings } from './settings.js';
import { initCoach, syncCoach } from './coach.js';
import { seedDemo, setPref, attachCloud, detachCloud, applyCloudPrefs, localBackup, isMock } from './state.js';
import * as cloud from './cloud.js';

// Dev/preview hooks — inert in normal use:
//   ?seed         fill with demo data (only when storage is empty, device mode only)
//   ?panel=N      open on panel N      ?hview=focus   ?pmode=detail
const q = new URLSearchParams(location.search);
if (q.has('seed') && !cloud.isConfigured) seedDemo();
if (q.has('hview')) setPref('historyView', q.get('hview'));
if (q.has('pmode')) setPref('progress.mode', q.get('pmode'));

// theme: light (default) or dark — a CSS-variable swap on <html data-theme>. Live, no reload.
const VALID_THEMES = ['light', 'dark'];
export function applyTheme(name) {
  const t = VALID_THEMES.includes(name) ? name : 'light';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b0b0d' : '#ffffff');
  try { localStorage.setItem('workout:theme', t); } catch {}
}
let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('workout:theme') || 'dark'; } catch {}
if (q.has('theme') && VALID_THEMES.includes(q.get('theme'))) savedTheme = q.get('theme');
applyTheme(savedTheme);

const pager = document.getElementById('pager');
const dock = document.getElementById('dock');
const indicator = document.getElementById('dock-indicator');
const dockBtns = [...document.querySelectorAll('.dock-btn')];

// ---- pager <-> dock ----
let ticking = false;
pager.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const w = pager.clientWidth || 1;
    const progress = pager.scrollLeft / w; // 0..2
    indicator.style.transform = `translateX(${progress * 76}px)`;
    const active = Math.round(progress);
    dockBtns.forEach((b, i) => b.classList.toggle('is-active', i === active));
  });
}, { passive: true });

export function goToPanel(i) {
  pager.scrollTo({ left: i * pager.clientWidth, behavior: 'smooth' });
}

dockBtns.forEach(b => b.addEventListener('click', () => goToPanel(+b.dataset.panel)));

window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  const w = pager.clientWidth || 1;
  const cur = Math.round(pager.scrollLeft / w);
  if (e.key === 'ArrowRight') goToPanel(Math.min(3, cur + 1));
  if (e.key === 'ArrowLeft') goToPanel(Math.max(0, cur - 1));
});

// Hide dock while typing (keyboard overlap on phones)
document.addEventListener('focusin', e => {
  if (e.target.matches('input')) dock.classList.add('is-hidden');
});
document.addEventListener('focusout', () => dock.classList.remove('is-hidden'));

// ---- shared bottom sheet ----
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
const sheetContent = document.getElementById('sheet-content');

export function openSheet(html) {
  sheetContent.innerHTML = html;
  sheet.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    backdrop.classList.add('open');
  });
  return sheetContent;
}

export function closeSheet() {
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; sheetContent.innerHTML = ''; }, 300);
}
backdrop.addEventListener('click', closeSheet);

// ---- toast ----
const toastEl = document.getElementById('toast');
let toastTimer = null;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 250);
  }, 1800);
}

// ---- boot panels ----
initLog();
initHistory();
initProgress();
initSettings();
initCoach();

if (q.has('panel')) {
  requestAnimationFrame(() => pager.scrollTo({ left: +q.get('panel') * pager.clientWidth }));
}
if (q.has('exday')) openDay(q.get('exday'));
if (q.has('ex')) openEntryFor(q.get('ex'));

// ---- auth + cloud sync (only when a Firebase config is present) ----
const gate = document.getElementById('auth-gate');

function showGate() { gate.hidden = false; requestAnimationFrame(() => gate.classList.add('open')); }
function hideGate() { gate.classList.remove('open'); setTimeout(() => { gate.hidden = true; }, 320); }

function makeBackend(uid) {
  return {
    putEntry: e => cloud.putEntry(uid, e),
    removeEntry: id => cloud.removeEntry(uid, id),
    savePrefs: p => cloud.savePrefs(uid, p),
    upload: (entries, prefs) => cloud.uploadLocal(uid, entries, prefs),
    clear: () => cloud.clearCloud(uid),
    subscribe: cb => cloud.subscribeEntries(uid, cb),
  };
}

async function onSignedIn(user) {
  const uid = user.uid;
  let cloudPrefs = null;
  try { cloudPrefs = await cloud.loadPrefs(uid); } catch (e) { console.error('loadPrefs', e); }
  applyCloudPrefs(cloudPrefs);
  attachCloud(makeBackend(uid));
  syncCoach();          // uid is known now — re-point the coach at this user's chat store
  hideGate();
  // one-time offer to lift this device's local history into the account
  let migrating = false;
  try {
    const backup = localBackup();
    const dismissed = localStorage.getItem('workout:migrate-dismissed:' + uid);
    if (backup?.entries?.length && !dismissed && (await cloud.countEntries(uid)) === 0) {
      offerMigration(uid, backup);
      migrating = true;
    }
  } catch (e) { console.error('migration check', e); }
  if (!migrating) setTimeout(maybeShowDemoNotice, 480);   // after the gate finishes closing
}

// One-time, after first login: tell the user the sample data is on and how to switch it off.
function maybeShowDemoNotice() {
  try { if (localStorage.getItem('workout:demo-notice-shown')) return; } catch {}
  if (!isMock()) return;
  try { localStorage.setItem('workout:demo-notice-shown', '1'); } catch {}
  const el = openSheet(`
    <h3>You're viewing demo data</h3>
    <div class="sheet-sub">The history and charts here are sample workouts, loaded so you can explore the app. When you're ready to track your own training, turn demo data off in Settings — your real log starts fresh and empty.</div>
    <button class="sheet-action accent" id="demo-settings">Open Settings to turn it off</button>
    <button class="sheet-action" id="demo-ok">Keep exploring for now</button>`);
  el.querySelector('#demo-settings').addEventListener('click', () => { closeSheet(); setTimeout(openSettings, 320); });
  el.querySelector('#demo-ok').addEventListener('click', () => closeSheet());
}

function offerMigration(uid, backup) {
  const n = backup.entries.length;
  const el = openSheet(`
    <h3>Bring your sets along</h3>
    <div class="sheet-sub">Found ${n} set${n > 1 ? 's' : ''} saved on this device. Add them to your account so they sync across your phone and laptop?</div>
    <button class="sheet-action accent" id="mig-yes">Add ${n} set${n > 1 ? 's' : ''} to my account</button>
    <button class="sheet-action" id="mig-no">Not now</button>`);
  el.querySelector('#mig-yes').addEventListener('click', async () => {
    try { await cloud.uploadLocal(uid, backup.entries, backup.prefs); toast('Synced to your account'); }
    catch (e) { toast('Upload failed — try again'); console.error(e); }
    closeSheet();
  });
  el.querySelector('#mig-no').addEventListener('click', () => {
    localStorage.setItem('workout:migrate-dismissed:' + uid, '1');
    closeSheet();
  });
}

const AUTH_ERRORS = {
  'auth/invalid-email': 'That email doesn’t look right.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Password needs at least 6 characters.',
  'auth/email-already-in-use': 'That email already has an account — try signing in.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account with that email — create one below.',
  'auth/popup-closed-by-user': 'Sign-in window closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the popup — allow it, or use email below.',
  'auth/network-request-failed': 'No connection. Check your network and retry.',
  'auth/unauthorized-domain': 'This site isn’t authorized in Firebase. Add this domain under Authentication → Settings → Authorized domains (use localhost, not 127.0.0.1).',
  'auth/operation-not-allowed': 'Google sign-in isn’t enabled in the Firebase console yet.',
};
// show the friendly message; append the raw code for anything unmapped so it's debuggable
const friendly = e => AUTH_ERRORS[e?.code] || `Sign-in failed${e?.code ? ` (${e.code})` : ''}. Try again.`;

function renderAuthGate() {
  gate.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="9" y="27" width="7" height="12" rx="2.5" fill="var(--push)"/>
          <rect x="20.5" y="20" width="7" height="19" rx="2.5" fill="var(--legs)"/>
          <rect x="32" y="11" width="7" height="28" rx="2.5" fill="var(--pull)"/>
        </svg>
        <span>Workout</span>
      </div>
      <h2 class="auth-title" id="auth-h">Welcome back</h2>
      <p class="auth-sub" id="auth-s">Sign in to sync your training everywhere.</p>
      <button class="auth-google" id="auth-google">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
        Continue with Google
      </button>
      <div class="auth-or"><span>or</span></div>
      <input class="auth-input" id="auth-email" type="email" inputmode="email" autocomplete="email" placeholder="Email" autocapitalize="off" spellcheck="false">
      <input class="auth-input" id="auth-pw" type="password" autocomplete="current-password" placeholder="Password">
      <div class="auth-error" id="auth-error"></div>
      <button class="auth-submit" id="auth-submit">Sign in</button>
      <button class="auth-toggle" id="auth-toggle">New here? <b>Create an account</b></button>
    </div>`;

  let mode = 'signin';
  const $ = id => gate.querySelector(id);
  const err = m => { $('#auth-error').textContent = m || ''; };

  $('#auth-toggle').addEventListener('click', () => {
    mode = mode === 'signin' ? 'register' : 'signin';
    err('');
    $('#auth-h').textContent = mode === 'signin' ? 'Welcome back' : 'Create your account';
    $('#auth-s').textContent = mode === 'signin' ? 'Sign in to sync your training everywhere.' : 'One account keeps your sets on every device.';
    $('#auth-submit').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    $('#auth-pw').setAttribute('autocomplete', mode === 'signin' ? 'current-password' : 'new-password');
    $('#auth-toggle').innerHTML = mode === 'signin' ? 'New here? <b>Create an account</b>' : 'Have an account? <b>Sign in</b>';
  });

  $('#auth-google').addEventListener('click', () => {
    err('');
    cloud.signInGoogle().catch(e => err(friendly(e)));
  });

  const submit = async () => {
    err('');
    const email = $('#auth-email').value.trim();
    const pw = $('#auth-pw').value;
    if (!email) return err('Enter your email.');
    if (!pw) return err('Enter your password.');
    const btn = $('#auth-submit');
    btn.disabled = true; btn.classList.add('is-busy');
    try {
      if (mode === 'signin') await cloud.signInEmail(email, pw);
      else await cloud.registerEmail(email, pw);
    } catch (e) { err(friendly(e)); }
    btn.disabled = false; btn.classList.remove('is-busy');
  };
  $('#auth-submit').addEventListener('click', submit);
  $('#auth-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

if (cloud.isConfigured) {
  showGate();
  renderAuthGate();
  cloud.initCloud().then(async () => {
    await cloud.resolveRedirect();          // finish any Google redirect sign-in
    cloud.watchAuth(user => {
      if (user) onSignedIn(user);
      else { detachCloud(); syncCoach(); showGate(); }
    });
  }).catch(e => {
    console.error('cloud init failed', e);
    const box = gate.querySelector('#auth-error');
    if (box) box.textContent = 'Could not reach the server.';
  });
} else {
  // device-only deployment (no Firebase): show the demo notice on first run
  setTimeout(maybeShowDemoNotice, 600);
}

// dev: preview the sign-in screen without a Firebase project (?authpreview)
if (q.has('authpreview')) { renderAuthGate(); showGate(); }

// ---- service worker ----
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
