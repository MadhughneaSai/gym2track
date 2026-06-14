/* AI Coach backend — Firebase Functions v2 (Node 20).
 *
 * One streaming HTTPS endpoint:
 *   - verifies the caller's Firebase ID token
 *   - loads their workout entries + memory profile from Firestore (Admin SDK)
 *   - builds a CACHE-OPTIMIZED prompt (frozen system + deterministic context first,
 *     conversation appended, new question last) so DeepSeek's prefix cache keeps hitting
 *   - streams DeepSeek's reply straight to the browser
 *   - then (best-effort) extracts durable facts about the user into users/{uid}/memories
 *
 * Secret:  DEEPSEEK_API_KEY   (firebase functions:secrets:set DEEPSEEK_API_KEY)
 * Model:   env DEEPSEEK_MODEL, default "deepseek-chat" — set to your exact V4 id if different.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const DEEPSEEK_API_KEY = defineSecret('DEEPSEEK_API_KEY');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
// deepseek-v4-flash = thinking mode by default (best coaching answers; the chat shows a
// "thinking" indicator while it reasons, then streams). Override via functions/.env:
//   deepseek-v4-pro   → deeper reasoning  ·  deepseek-chat → faster non-thinking (deprecates 2026-07-24)
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

// ── exercise catalog (mirrors js/exercises.js) so the summary reads in plain names ──
const EX = {
  'chest-fly': ['Chest Fly', 'push'], 'incline-press': ['Incline Press', 'push'],
  'triceps-pushdown': ['Triceps Pushdown', 'push'], 'lateral-raise': ['Lateral Raise', 'push'],
  'shoulder-press': ['Shoulder Press', 'push'],
  'leg-extension': ['Leg Extension', 'legs'], 'hamstring-curl': ['Hamstring Curl', 'legs'],
  'calf-raise': ['Calf Raise', 'legs'], 'back-extension': ['Back Extension', 'legs'],
  'ab-crunch': ['Ab Crunch', 'legs'],
  'chest-supported-row': ['Supported Row', 'pull'], 'lat-pulldown': ['Lat Pulldown', 'pull'],
  'bicep-curl': ['Barbell Curl', 'pull'], 'forearm-curl': ['Overhand Forearm', 'pull'],
  'forearm-curl-under': ['Underhand Forearm', 'pull'],
};
const epley = (w, r) => w * (1 + r / 30);

// ── FROZEN system persona. Keep this a constant — never interpolate per-request data here. ──
const SYSTEM = [
  'You are an expert strength & hypertrophy coach embedded in the user\'s personal workout tracker.',
  'You have their logged sets, computed strength trends, and a memory profile built from past chats.',
  'Coaching rules:',
  '- Be specific and reference their actual numbers (weights, reps, e1RM, trends) when relevant.',
  '- When diagnosing a stall or dip, ask 1–2 targeted lifestyle questions (sleep, nutrition, stress,',
  '  soreness, schedule) before giving definitive advice — do not guess at causes.',
  '- Give concrete, actionable next steps. Prefer 2–5 sentences; expand only when asked.',
  '- Never invent sets, numbers, or history you were not given. If data is missing, say so.',
  '- e1RM is estimated one-rep max via Epley (weight × (1 + reps/30)); higher means stronger.',
  'Warm, direct, encouraging — a knowledgeable coach, not a hype machine.',
].join('\n');

function buildContext(entries, memories) {
  // training summary: top set per date per exercise, then current/best/trend
  const byEx = {};
  for (const e of entries) {
    (byEx[e.exercise] ||= {});
    const k = e.date;
    const cur = byEx[e.exercise][k];
    if (!cur || epley(e.weight, e.reps) > epley(cur.weight, cur.reps)) byEx[e.exercise][k] = e;
  }
  const lines = [];
  for (const id of Object.keys(EX)) {
    const byDate = byEx[id];
    if (!byDate) continue;
    const dates = Object.keys(byDate).sort();           // deterministic
    const series = dates.map(d => byDate[d]);
    const first = series[0], last = series[series.length - 1];
    const now = epley(last.weight, last.reps);
    const best = Math.max(...series.map(s => epley(s.weight, s.reps)));
    const pct = first ? Math.round(((now - epley(first.weight, first.reps)) / epley(first.weight, first.reps)) * 100) : 0;
    const recent = series.slice(-3).map(s => `${s.weight}×${s.reps}`).join(', ');
    lines.push(`${EX[id][0]} (${EX[id][1]}): now ~${Math.round(now)} e1RM (${last.weight}lb×${last.reps}), best ~${Math.round(best)}, ${pct >= 0 ? '+' : ''}${pct}% since first, ${dates.length} sessions; recent: ${recent}`);
  }

  const memLines = memories.map(m => `- ${m.text}`).join('\n');

  return [
    '=== ATHLETE TRAINING SUMMARY ===',
    lines.length ? lines.join('\n') : '(no workouts logged yet)',
    '',
    '=== WHAT I KNOW ABOUT THIS PERSON ===',
    memLines || '(nothing recorded yet — ask and learn)',
  ].join('\n');
}

async function loadUser(uid) {
  const [entriesSnap, memSnap] = await Promise.all([
    db.collection(`users/${uid}/entries`).get(),
    db.collection(`users/${uid}/memories`).orderBy('createdAt').limit(120).get(),
  ]);
  const entries = entriesSnap.docs.map(d => d.data()).filter(e => e && e.exercise);
  const memories = memSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { entries, memories };
}

// Demo mode: the sample sets are sent by the client (they're not in Firestore). Trust nothing —
// keep only known exercises with finite numbers, and cap the count.
function sanitizeEntries(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const e of arr) {
    if (!e || !EX[e.exercise]) continue;
    const weight = Number(e.weight), reps = Number(e.reps);
    if (!Number.isFinite(weight) || !Number.isFinite(reps) || typeof e.date !== 'string') continue;
    out.push({ exercise: e.exercise, weight, reps, date: e.date });
    if (out.length >= 600) break;
  }
  return out;
}

// Parse an OpenAI-style SSE stream, invoking onDelta(text) for each content chunk.
async function pipeDeepSeek(body, apiKey, onDelta) {
  const r = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => '');
    throw new Error(`deepseek ${r.status}: ${txt.slice(0, 300)}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch { /* ignore keep-alive / partial */ }
    }
  }
}

// Best-effort: maintain a long-term memory profile from the recent conversation.
async function extractMemories(uid, recentMsgs, existing, apiKey) {
  try {
    const transcript = recentMsgs.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
    const known = existing.map(m => `- ${m.text}`).join('\n') || '(none yet)';
    const prompt =
      'You maintain a long-term memory profile of a strength-training user, used in every future chat. ' +
      'From the RECENT CONVERSATION, extract DURABLE facts worth remembering — especially QUANTITATIVE lifestyle facts:\n' +
      '• sleep (hours/schedule), nutrition (protein/calorie intake, diet style), bodyweight\n' +
      '• training schedule (which days, weekly frequency), injuries or pain, equipment / gym access\n' +
      '• goals, and stable preferences\n' +
      'Rules: capture only STABLE facts (ignore one-off moods/feelings and anything already in ALREADY KNOWN); ' +
      'rewrite each as a concise standalone statement (e.g. "Sleeps ~5h on weeknights", "Eats ~120g protein/day", "Trains Mon/Wed/Fri", "Right shoulder pain on overhead press"). ' +
      'Do NOT restate workout set/weight numbers — those come from the log. ' +
      'Return JSON {"facts":[{"text":"...","kind":"..."}]} where kind ∈ sleep|nutrition|injury|schedule|bodyweight|goal|preference|note. Empty array if nothing new.\n\n' +
      'ALREADY KNOWN:\n' + known + '\n\nRECENT CONVERSATION:\n' + transcript;
    const r = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 400,
        stream: false,
      }),
    });
    if (!r.ok) return;
    const json = await r.json();
    const facts = JSON.parse(json.choices?.[0]?.message?.content || '{}').facts || [];
    const seen = new Set(existing.map(m => (m.text || '').toLowerCase().trim()));
    const batch = db.batch();
    let n = 0;
    for (const f of facts) {
      const text = (f.text || '').trim();
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      const ref = db.collection(`users/${uid}/memories`).doc();
      batch.set(ref, { text, kind: f.kind || 'note', createdAt: Date.now() });
      if (++n >= 5) break;
    }
    if (n) await batch.commit();
  } catch (e) { console.error('extractMemories', e); }
}

exports.coach = onRequest(
  // invoker:'public' = anyone can REACH the function; the Firebase ID-token check inside is the
  // real gate. Without this, Cloud Run rejects every request with 403 before our code runs.
  { secrets: [DEEPSEEK_API_KEY], timeoutSeconds: 120, memory: '256MiB', cors: false, invoker: 'public' },
  async (req, res) => {
    // CORS (token is the real gate, so any origin is allowed)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).end(); return; }

    // auth
    let uid;
    try {
      const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
      if (!m) throw new Error('no token');
      uid = (await admin.auth().verifyIdToken(m[1])).uid;
    } catch {
      res.status(401).json({ error: 'unauthorized' }); return;
    }

    const clientMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!clientMessages.length) { res.status(400).json({ error: 'no messages' }); return; }
    // keep only role+content, cap history
    const convo = clientMessages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    const apiKey = DEEPSEEK_API_KEY.value();
    // Demo mode: coach on the client-sent sample sets, with NO persistent memory — keeps the
    // demo fully isolated from the user's real Firestore data (read or write).
    const demo = req.body?.demo === true;
    let entries = [], memories = [];

    try {
      if (demo) {
        entries = sanitizeEntries(req.body?.entries);
      } else {
        const ctx = await loadUser(uid);
        entries = ctx.entries;
        memories = ctx.memories;
      }
      console.log(`coach: uid=${uid.slice(0, 8)}… ${demo ? 'DEMO ' : ''}entries=${entries.length} memories=${memories.length}`);
      // CACHE-OPTIMIZED ordering: frozen persona + deterministic context as one system message,
      // then the conversation, then the latest question (already last in convo).
      const messages = [
        { role: 'system', content: `${SYSTEM}\n\n${buildContext(entries, memories)}` },
        ...convo,
      ];

      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.set('Cache-Control', 'no-cache');
      res.set('X-Accel-Buffering', 'no');

      let answer = '';
      await pipeDeepSeek(
        { model: MODEL, messages, stream: true, max_tokens: 1024 },
        apiKey,
        delta => { answer += delta; res.write(delta); if (res.flush) res.flush(); },
      );

      // learn from this exchange (does not affect the already-streamed answer):
      // feed the last several turns + the fresh answer so multi-turn facts aren't missed.
      // Skipped in demo mode — sample chats must never write to the real memory profile.
      if (answer && !demo) {
        const recent = [...convo.slice(-7), { role: 'assistant', content: answer }];
        await extractMemories(uid, recent, memories, apiKey);
      }

      res.end();
    } catch (e) {
      console.error('coach', e);
      if (!res.headersSent) res.status(500).json({ error: 'coach failed' });
      else { try { res.write('\n\n(Sorry — something went wrong reaching your coach.)'); res.end(); } catch {} }
    }
  },
);
