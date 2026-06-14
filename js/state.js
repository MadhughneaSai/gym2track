// Store: one localStorage JSON doc, in-memory entries, save on mutation.

import { exById, EXERCISES } from './exercises.js';

// Real and mock data live in SEPARATE documents and never touch each other.
// Toggling demo mode just swaps which one is active; your real sets are untouched.
const KEY_REAL = 'workout:v1';
const KEY_MOCK = 'workout:mock';
const MODE_KEY = 'workout:mode';

// First run (no stored choice) → start in demo mode so the app is populated to explore.
// Once the user sets it (on/off), that choice is respected forever after.
let mode = 'real';
let firstRunDemo = false;
try {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === 'mock') mode = 'mock';
  else if (stored === null) { mode = 'mock'; firstRunDemo = true; }
} catch {}
const activeKey = () => (mode === 'mock' ? KEY_MOCK : KEY_REAL);

export const isMock = () => mode === 'mock';
// true only on a brand-new device that's never chosen a data mode (drives the one-time notice)
export const isFirstRunDemo = () => firstRunDemo;

const blank = () => ({
  version: 1,
  entries: [],
  prefs: {
    historyView: 'grid',
    progress: { day: 'push', exercise: 'chest-fly', mode: 'strength', range: 'all' },
    lastInput: {},
  },
});

function readDoc(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) return { ...blank(), ...parsed, prefs: { ...blank().prefs, ...parsed.prefs } };
    }
  } catch { /* corrupted -> blank; export/import is the recovery path */ }
  return blank();
}

let doc = blank();
function loadLocalDoc() { doc = readDoc(activeKey()); }
// NOTE: first-run demo seeding + the initial load happen at the bottom of this
// module, after buildDemoDoc()/ensureMockSeed() and the consts they close over
// (BASE_W, hash) are initialized — calling them here would hit the TDZ.

function save() {
  localStorage.setItem(activeKey(), JSON.stringify(doc));
}

// ---- backend: null = device-only (localStorage). Set by app.js when signed into cloud.
//   { putEntry(entry), removeEntry(id), savePrefs(prefs), upload(entries, prefs),
//     clear(), subscribe(cb) }  — all bound to the signed-in uid.
let backend = null;
let lastCloudEntries = [];     // latest live snapshot (so demo mode can pause + restore it)
let cloudPrefs = null;         // cloud prefs snapshot (restored when leaving demo mode)
export const isCloud = () => backend !== null;
// cloud writes happen only when signed in AND not previewing demo data
const useCloud = () => !!backend && mode !== 'mock';

export function attachCloud(b) {
  backend = b;
  lastCloudEntries = [];
  if (mode !== 'mock') { doc.entries = []; emit(); } // live snapshot fills it
  backend.subscribe(entries => {
    lastCloudEntries = entries;
    if (mode !== 'mock') { doc.entries = entries; emit(); } // demo preview isn't clobbered
  });
}
export function detachCloud() {
  backend = null;
  lastCloudEntries = [];
  cloudPrefs = null;
  loadLocalDoc();              // back to this device's own data
  emit();
}
export function applyCloudPrefs(p) {
  cloudPrefs = p ? { ...blank().prefs, ...p } : { ...blank().prefs };
  if (mode !== 'mock') doc.prefs = cloudPrefs;
  emit();
}

// Toggle demo data on/off. Works in BOTH device and cloud mode; demo is a local
// sandbox that NEVER touches your real data (workout:v1) or your cloud account.
export function setMockMode(on) {
  const next = on ? 'mock' : 'real';
  if (next === mode) return mode;
  if (on) ensureMockSeed();              // populate the mock doc the first time
  mode = next;
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  if (mode === 'mock') {
    loadLocalDoc();                      // show the isolated mock doc
  } else if (backend) {
    // restore the live cloud view we paused
    doc = { version: 1, entries: lastCloudEntries.slice(), prefs: cloudPrefs || blank().prefs };
  } else {
    loadLocalDoc();                      // back to this device's real doc
  }
  emit();
  return mode;
}
// migration source: this device's REAL localStorage doc (never the mock doc)
export function localBackup() {
  const d = readDoc(KEY_REAL);
  return d.entries.length ? d : null;
}

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());

// ---- dates (always LOCAL time — toISOString would mislabel late-night sets) ----
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function fmtDate(key) {
  const d = parseKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
export function fmtDow(key) { return DOWS[parseKey(key).getDay()]; }
export function fmtLong(key) {
  const d = parseKey(key);
  return `${DOWS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ---- strength score (the one formula; swap here if it ever disagrees with feel) ----
export const epley = (w, r) => w * (1 + r / 30);

// ---- mutations ----
// `date` optional (YYYY-MM-DD). Omitted → today. Backdated entries slot into that day
// everywhere downstream (table/chart/coach all group by `date`).
export function addEntry({ exercise, weight, reps, date }) {
  const ex = exById[exercise];
  const dateKey = date || todayKey();
  const backdated = dateKey !== todayKey();
  // timestamp: today → now (correct intra-day order); backdated → noon of that date,
  // nudged by existing same-day count so sequential backfills keep their order.
  const sameDay = doc.entries.filter(e => e.date === dateKey).length;
  const t = backdated ? parseKey(dateKey).setHours(12, 0, Math.min(sameDay, 59), 0) : Date.now();
  const entry = { id: crypto.randomUUID(), date: dateKey, day: ex.day, exercise, weight, reps, t };

  // prefill should track the most-recent session — an older backfill must not clobber it
  const latestForEx = doc.entries.reduce((m, e) => (e.exercise === exercise && e.date > m ? e.date : m), '');
  if (dateKey >= latestForEx) doc.prefs.lastInput[exercise] = { weight, reps };

  if (useCloud()) {
    doc.entries = [...doc.entries, entry]; // optimistic; snapshot reconciles by id
    emit();
    backend.putEntry(entry);
    backend.savePrefs(doc.prefs);
  } else {
    doc.entries.push(entry);
    save();                                // demo mode -> mock doc; device -> real doc
    emit();
  }
  return entry;
}

export function deleteEntry(id) {
  doc.entries = doc.entries.filter(e => e.id !== id);
  emit();
  if (useCloud()) backend.removeEntry(id); else save();
}

export function setPref(path, value) {
  if (path === 'historyView') doc.prefs.historyView = value;
  else if (path.startsWith('progress.')) doc.prefs.progress[path.slice(9)] = value;
  if (useCloud()) backend.savePrefs(doc.prefs); else save();
}
export const prefs = () => doc.prefs;

// ---- selectors ----
export const allEntries = () => doc.entries;

export function activeDates() {
  return [...new Set(doc.entries.map(e => e.date))].sort(); // ascending
}

export function entriesFor(date, exercise) {
  return doc.entries
    .filter(e => e.date === date && e.exercise === exercise)
    .sort((a, b) => a.t - b.t);
}

export function topSet(date, exercise) {
  const list = entriesFor(date, exercise);
  if (!list.length) return null;
  return list.reduce((best, e) => (epley(e.weight, e.reps) > epley(best.weight, best.reps) ? e : best));
}

export function dayTypesOf(date) {
  const set = new Set(doc.entries.filter(e => e.date === date).map(e => e.day));
  return ['push', 'legs', 'pull'].filter(d => set.has(d));
}

export function lastInputFor(exercise) {
  return doc.prefs.lastInput[exercise] || null;
}

export function lastLogged(exercise) {
  let best = null;
  for (const e of doc.entries) {
    if (e.exercise === exercise && (!best || e.t > best.t)) best = e;
  }
  return best;
}

// Chart series: top set per date, ascending by date
export function seriesFor(exercise) {
  const dates = [...new Set(doc.entries.filter(e => e.exercise === exercise).map(e => e.date))].sort();
  return dates.map(date => {
    const s = topSet(date, exercise);
    return { date, weight: s.weight, reps: s.reps, e1rm: epley(s.weight, s.reps) };
  });
}

// Previous session's top set for an exercise, strictly before `date` (Focus deltas)
export function prevTopSet(exercise, date) {
  const dates = [...new Set(doc.entries.filter(e => e.exercise === exercise && e.date < date).map(e => e.date))].sort();
  if (!dates.length) return null;
  return topSet(dates[dates.length - 1], exercise);
}

// ---- backup ----
export const exportJSON = () => JSON.stringify(doc, null, 2);

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('Not a valid backup file');
  if (useCloud()) {
    backend.upload(parsed.entries, parsed.prefs); // snapshot refreshes the view
  } else {
    doc = { ...blank(), ...parsed, prefs: { ...blank().prefs, ...parsed.prefs } };
    save();
    emit();
  }
}

export function clearAll() {
  if (useCloud()) {
    backend.clear();
    doc.entries = [];
    emit();
  } else {
    doc = blank();
    save();                                // demo mode clears the mock doc only
    emit();
  }
}

// ---- demo data — lives ONLY in the mock doc (workout:mock), never the real one ----
const BASE_W = {
  'chest-fly': 100, 'incline-press': 50, 'triceps-pushdown': 60, 'lateral-raise': 25, 'shoulder-press': 40,
  'leg-extension': 90, 'hamstring-curl': 80, 'calf-raise': 120, 'back-extension': 100, 'ab-crunch': 70,
  'chest-supported-row': 70, 'lat-pulldown': 100, 'bicep-curl': 50, 'forearm-curl': 30, 'forearm-curl-under': 30,
};
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000, 7);

function buildDemoDoc() {
  const d0 = blank();
  const dayOffset = { push: 0, legs: 2, pull: 4 };
  const today = new Date();
  for (let week = 0; week < 9; week++) {
    for (const ex of EXERCISES) {
      const noise = (hash(ex.id + week) % 3) - 1; // -1..1
      const d = new Date(today);
      d.setDate(d.getDate() - (8 - week) * 7 - (4 - dayOffset[ex.day]));
      if (d > today) continue;
      const weight = BASE_W[ex.id] + Math.floor(week / 2) * 5 + (week === 5 ? -5 : 0);
      const reps = 8 + ((week + hash(ex.id)) % 3) + (noise === 1 ? 1 : 0);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      d0.entries.push({
        id: crypto.randomUUID(), date, day: ex.day, exercise: ex.id,
        weight, reps, t: d.setHours(18, 10 + (hash(ex.id) % 40), 0, 0),
      });
      d0.prefs.lastInput[ex.id] = { weight, reps };
    }
  }
  return d0;
}

// Seed the mock doc once (only if it's empty). Never touches the real doc.
function ensureMockSeed() {
  const existing = readDoc(KEY_MOCK);
  if (existing.entries.length) return;
  localStorage.setItem(KEY_MOCK, JSON.stringify(buildDemoDoc()));
}

// Back-compat for the ?seed URL param: flip into isolated demo mode.
export function seedDemo() { setMockMode(true); }

// ---- module init (runs last, so demo helpers + their consts are ready) ----
// On a brand-new device: persist the demo choice and populate the mock doc so
// the app opens full of sample data. Then load whichever doc is active.
if (firstRunDemo) { try { localStorage.setItem(MODE_KEY, 'mock'); } catch {} ensureMockSeed(); }
loadLocalDoc();
