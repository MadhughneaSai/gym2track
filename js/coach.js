// Panel 4 — AI Coach. Multi-conversation chat UI + streaming client for the DeepSeek backend.
// The server owns the prompt (system persona + your workout/memory context, cache-optimized);
// this client sends the active conversation and streams the reply. Conversations persist
// per-device: "+" starts a fresh one, old ones stay in History, and after a stretch of
// inactivity the next visit rolls into a new chat automatically.

import { isConfigured, currentUser, getIdToken, clearMemories, loadMemories, deleteMemory } from './cloud.js';
import { openSheet, closeSheet, toast } from './app.js';
import { isMock, allEntries, onChange } from './state.js';
import { GLYPHS } from './icons.js';

// ── Backend endpoint (deployed Firebase function). Empty/PASTE → dev stub mode.
export const COACH_ENDPOINT = 'https://coach-fzyyk54rpq-uc.a.run.app';
const isLive = !!COACH_ENDPOINT && !COACH_ENDPOINT.startsWith('PASTE');

const EXAMPLES = [
  'Why has my chest fly stalled?',
  'What should I focus on this week?',
  'Is my training volume too high?',
];

const ROLL_AFTER = 30 * 60 * 1000;   // 30 min idle → next visit starts a fresh chat
const MAX_CONVOS = 40;               // keep the most recent N conversations

let convos = [];        // [{ id, title, messages:[{role,content}], createdAt, updatedAt }]
let activeId = null;
let streaming = false;
let loadedKey = null;   // which store key convos was last loaded from (re-point when it changes)
const els = {};

export function initCoach() {
  els.list = document.getElementById('coach-messages');
  els.form = document.getElementById('coach-composer');
  els.input = document.getElementById('coach-input');
  els.send = document.getElementById('coach-send');
  els.clear = document.getElementById('coach-clear');     // "+" new chat
  els.history = document.getElementById('coach-history'); // chat list

  load();
  rollIfStale();
  render();

  els.form.addEventListener('submit', e => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (text && !streaming) ask(text);
  });
  els.clear.addEventListener('click', () => { if (!streaming) newChat(); });
  els.history.addEventListener('click', () => { if (!streaming) openHistory(); });

  // returning after a while (reopened PWA / refocus) rolls into a fresh chat
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !streaming && rollIfStale()) render();
  });

  // Demo toggle flips the data mode (→ a different store key). When leaving demo, wipe the demo
  // session first so it's a clean reset, then re-point at whichever store now applies.
  let lastMock = isMock();
  onChange(() => {
    const m = isMock();
    if (m !== lastMock) {
      lastMock = m;
      if (!m) { try { localStorage.removeItem(demoStoreKey()); } catch {} }  // left demo → reset it
    }
    reloadIfStoreChanged();
  });
}

// Re-point the coach at the store for the current user + mode if it changed. The store is keyed
// by uid, but the uid isn't known yet at initCoach() time (auth resolves async after boot), so
// without this the user's own saved chats stay loaded under "local" and look like they vanished.
// Idempotent: a no-op unless the active store key actually changed.
function reloadIfStoreChanged() {
  if (storeKey() === loadedKey) return false;
  load();
  rollIfStale();
  render();
  return true;
}

// Called by app.js whenever auth state resolves (sign-in / sign-out): the uid becomes available
// (or clears), so swap the coach to that user's chat store.
export function syncCoach() { reloadIfStoreChanged(); }

/* ============ conversation store (per-device, per-user) ============ */
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random());
const uidPart = () => (isConfigured && currentUser()?.uid) || 'local';
// Demo chats live in their OWN store, isolated from real ones (same idea as the data layer).
// Leaving demo wipes the demo store — a clean reset — and the real coach resumes untouched.
const demoStoreKey = () => `workout:coach:v2:${uidPart()}:demo`;
const storeKey = () => `workout:coach:v2:${uidPart()}${isMock() ? ':demo' : ''}`;
const titleFromMsgs = msgs => { const u = msgs.find(m => m.role === 'user'); return u ? u.content.slice(0, 48) : ''; };

function load() {
  loadedKey = storeKey();
  let s = null;
  try { s = JSON.parse(localStorage.getItem(loadedKey)); } catch {}
  convos = (s && Array.isArray(s.convos)) ? s.convos : [];
  activeId = (s && s.active) || (convos[0] && convos[0].id) || null;

  // migrate the old single-thread store (workout:coach:{uid}) into one conversation
  // (real store only — never fold real chats into the isolated demo store)
  if (!convos.length && !isMock()) {
    try {
      const old = JSON.parse(localStorage.getItem(`workout:coach:${uidPart()}`) || 'null');
      if (Array.isArray(old) && old.length) {
        const c = { id: rid(), title: titleFromMsgs(old), messages: old, createdAt: Date.now(), updatedAt: Date.now() };
        convos = [c]; activeId = c.id; saveStore();
      }
    } catch {}
  }
}

function saveStore() {
  // newest first, cap count, cap each thread's length
  convos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (convos.length > MAX_CONVOS) convos = convos.slice(0, MAX_CONVOS);
  for (const c of convos) if (c.messages.length > 80) c.messages = c.messages.slice(-80);
  try { localStorage.setItem(storeKey(), JSON.stringify({ active: activeId, convos })); } catch {}
}

function activeConvo() {
  let c = convos.find(x => x.id === activeId);
  if (!c) {
    c = { id: rid(), title: '', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    convos.push(c); activeId = c.id; saveStore();
  }
  return c;
}

// roll into a fresh chat if the active one is non-empty and idle past the timeout
function rollIfStale() {
  const c = convos.find(x => x.id === activeId);
  if (c && c.messages.length && Date.now() - (c.updatedAt || 0) > ROLL_AFTER) { newChat(); return true; }
  return false;
}

function newChat() {
  const c = convos.find(x => x.id === activeId);
  if (c && c.messages.length === 0) { render(); return; } // already on a blank chat — reuse it
  const fresh = { id: rid(), title: '', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  convos.push(fresh);
  activeId = fresh.id;
  saveStore();
  render();
}

function setActive(id) { activeId = id; saveStore(); render(); }

function deleteConvo(id) {
  convos = convos.filter(c => c.id !== id);
  if (activeId === id) activeId = convos[0]?.id || null;
  saveStore();
}

/* ============ Settings hooks: reset + export ============ */
export async function resetCoachMemory() {
  convos = []; activeId = null;
  saveStore();
  if (els.list) render();
  // Only clear the real server-side profile in real mode — demo writes no memories,
  // so a demo reset must never touch the user's actual Firestore memory profile.
  if (isConfigured && currentUser() && !isMock()) await clearMemories(currentUser().uid);
}

// "What your coach knows": show the durable memory profile that's loaded into EVERY chat,
// with per-fact delete. This is the global memory (separate from individual chat threads).
export async function openCoachKnowledge() {
  if (!isConfigured || !currentUser()) {
    openSheet(`<h3>What your coach knows</h3><div class="coach-note" style="padding:16px">Sign in to build a memory profile your coach uses across every chat.</div>`);
    return;
  }
  const sheet = openSheet(`<h3>What your coach knows</h3>
    <div class="sheet-sub">Facts it remembers about you and uses in <b>every</b> chat. Delete anything wrong.</div>
    <div class="coach-mem" id="coach-mem"><div class="coach-note" style="padding:14px">Loading…</div></div>`);

  let mems = [];
  try { mems = await loadMemories(currentUser().uid); } catch (e) { console.error(e); }
  mems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const box = sheet.querySelector('#coach-mem');
  const paint = () => {
    if (!mems.length) {
      box.innerHTML = `<div class="coach-note" style="padding:14px">Nothing yet. Tell your coach about your sleep, nutrition, training days, injuries, or goals — it'll remember across chats.</div>`;
      return;
    }
    box.innerHTML = mems.map(m => `
      <div class="coach-mem-row">
        <span class="cm-kind">${esc(m.kind || 'note')}</span>
        <span class="cm-text">${esc(m.text || '')}</span>
        <button class="cm-del" data-id="${m.id}" aria-label="Forget this">${GLYPHS.trash}</button>
      </div>`).join('');
    box.querySelectorAll('.cm-del').forEach(b => b.addEventListener('click', async () => {
      const idDel = b.dataset.id;
      try { await deleteMemory(currentUser().uid, idDel); } catch (e) { console.error(e); }
      mems = mems.filter(m => m.id !== idDel);
      paint();
    }));
  };
  paint();
}

export async function exportCoachData() {
  let memories = [];
  if (isConfigured && currentUser()) {
    try { memories = await loadMemories(currentUser().uid); } catch (e) { console.error('loadMemories', e); }
  }
  const payload = {
    type: 'workout-coach-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    memories,   // what the coach has learned about you (server-side profile)
    chats: convos.map(c => ({ title: c.title || titleFromMsgs(c.messages), createdAt: c.createdAt, updatedAt: c.updatedAt, messages: c.messages })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return { memories: memories.length, chats: convos.length };
}

/* ============ render ============ */
function render() {
  const msgs = activeConvo().messages;
  if (!msgs.length) { renderEmpty(); return; }
  els.list.innerHTML = '';
  for (const m of msgs) els.list.appendChild(bubble(m.role === 'user' ? 'user' : 'coach', m.content));
  scrollDown();
}

function renderEmpty() {
  els.list.innerHTML = `
    <div class="coach-empty">
      <div class="ce-orb">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z"/></svg>
      </div>
      <div class="ce-title">Your training coach</div>
      <div class="ce-sub">Ask anything — it knows your logged sets, your strength trends, and what you've told it about yourself.</div>
      <div class="ce-chips">
        ${EXAMPLES.map(q => `<button class="coach-chip" type="button">${esc(q)}</button>`).join('')}
      </div>
      ${isLive ? '' : '<div class="coach-note">Demo mode — connect your coach backend to go live (see AI_PLAN.md).</div>'}
    </div>`;
  els.list.querySelectorAll('.coach-chip').forEach(c =>
    c.addEventListener('click', () => { if (!streaming) ask(c.textContent); }));
}

function bubble(kind, text) {
  const el = document.createElement('div');
  el.className = `coach-msg ${kind}`;
  if (kind === 'coach') el.innerHTML = mdToHtml(text);
  else el.textContent = text;          // user text stays literal (and escaped)
  return el;
}

// minimal, safe markdown for coach replies: escape first, then **bold**, `code`, • bullets.
function mdToHtml(src) {
  let s = String(src).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\n)[ \t]*[-*][ \t]+/g, '$1• ');
  return s;
}
function scrollDown() { requestAnimationFrame(() => { els.list.scrollTop = els.list.scrollHeight; }); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ============ chat history sheet ============ */
function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function openHistory() {
  const list = convos.filter(c => c.messages.length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const rows = list.length ? list.map(c => {
    const title = esc(c.title || titleFromMsgs(c.messages) || 'New chat');
    const last = c.messages[c.messages.length - 1];
    const preview = esc((last ? last.content : '').slice(0, 60));
    return `<button class="coach-hist-row${c.id === activeId ? ' is-active' : ''}" data-id="${c.id}">
        <div class="chr-main">
          <div class="chr-title">${title}</div>
          <div class="chr-prev">${preview}</div>
        </div>
        <div class="chr-time">${relTime(c.updatedAt || c.createdAt)}</div>
        <span class="chr-del" data-del="${c.id}" aria-label="Delete chat">${GLYPHS.trash}</span>
      </button>`;
  }).join('') : '<div class="coach-note" style="padding:18px">No past chats yet.</div>';

  const sheet = openSheet(`
    <h3>Your chats</h3>
    <div class="sheet-sub">Pick up an old conversation, or start fresh.</div>
    <button class="sheet-action accent" id="chr-new">＋ New chat</button>
    <div class="coach-hist">${rows}</div>`);

  sheet.querySelector('#chr-new').addEventListener('click', () => { closeSheet(); newChat(); });

  sheet.querySelectorAll('.coach-hist-row').forEach(row => {
    row.addEventListener('click', e => {
      const del = e.target.closest('.chr-del');
      if (del) { e.stopPropagation(); deleteConvo(del.dataset.del); render(); openHistory(); return; }
      closeSheet();
      setActive(row.dataset.id);
    });
  });
}

/* ============ ask + stream ============ */
async function ask(text) {
  const convo = activeConvo();
  if (convo.messages.length === 0) els.list.innerHTML = '';   // clear empty state
  convo.messages.push({ role: 'user', content: text });
  if (!convo.title) convo.title = text.slice(0, 48);
  convo.updatedAt = Date.now();
  els.list.appendChild(bubble('user', text));
  els.input.value = '';
  saveStore();

  streaming = true;
  els.send.disabled = true;
  scrollDown();

  const reply = document.createElement('div');
  reply.className = 'coach-msg coach';
  reply.innerHTML = '<span class="coach-typing"><i></i><i></i><i></i></span>';
  els.list.appendChild(reply);
  scrollDown();

  let acc = '';
  const onToken = t => {
    acc += t;
    reply.innerHTML = mdToHtml(acc) + '<span class="cursor"></span>';
    scrollDown();
  };

  try {
    if (isLive) await streamLive(onToken, convo.messages);
    else await streamStub(onToken, text);
  } catch (err) {
    console.error('coach error', err);
    acc = acc || 'Sorry — I couldn’t reach your coach just now. Check your connection and try again.';
  }

  reply.innerHTML = mdToHtml(acc);         // render final markdown, drop the cursor
  convo.messages.push({ role: 'assistant', content: acc });
  convo.updatedAt = Date.now();
  saveStore();
  streaming = false;
  els.send.disabled = false;
  scrollDown();
}

async function streamLive(onToken, msgs) {
  const token = isConfigured ? await getIdToken() : null;
  const body = { messages: msgs };
  // Demo mode: the sample sets live only on this device, so ship them with the request.
  // The server coaches on these instead of your Firestore data and writes no memories.
  if (isMock()) { body.demo = true; body.entries = demoEntriesForCoach(); }
  const res = await fetch(COACH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`coach ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onToken(dec.decode(value, { stream: true }));
  }
}

// Active (demo) sets, trimmed to what the coach needs. Capped so the payload stays small.
function demoEntriesForCoach() {
  return allEntries()
    .filter(e => e && e.exercise && Number.isFinite(+e.weight) && Number.isFinite(+e.reps) && e.date)
    .slice(-600)
    .map(e => ({ exercise: e.exercise, weight: +e.weight, reps: +e.reps, date: e.date }));
}

async function streamStub(onToken, question) {
  const reply =
    `(demo) Here's where a real answer would stream in, grounded in your data. ` +
    `Once your DeepSeek coach backend is connected, I'll use your logged sets, your strength ` +
    `trends, and what I've learned about you to answer "${question}" specifically.`;
  await new Promise(r => setTimeout(r, 350));
  for (const word of reply.split(' ')) {
    onToken(word + ' ');
    await new Promise(r => setTimeout(r, 28));
  }
}
