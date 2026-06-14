# AI Coach — Architecture Plan (v1)

Written 2026-06-13. A 4th page: a chat window that answers training questions with full
context of the user — not just their logged workouts, but a memory profile built up over time.
Backend runs on DeepSeek V4 with cache-optimized prompting; auth + data via the existing Firebase.

---

## 1. Goal

A personal AI strength coach the owner talks to in-app. Unlike asking a generic chatbot, this one
already knows: every logged set, computed strength trends (e1RM/PRs), and a growing memory of the
person (sleep, nutrition, injuries, preferences, goals). It asks lifestyle follow-ups when
diagnosing a dip and remembers the answers, so it gets smarter about *you* the more you use it.

## 2. Why this shape

- **Static site + phones + a secret API key** ⇒ the key must live server-side. A serverless function
  is the proxy. We're already on **Firebase** (Auth + Firestore), so a **Firebase HTTPS function**
  is the least-friction backend: it verifies the Firebase ID token (same project), reads the user's
  data with the Admin SDK (bypasses client rules — no rules change), and calls DeepSeek.
- **DeepSeek V4** is the model: extremely cheap, 1M context, and — critically — **automatic prefix
  caching** with a ~50× hit/miss price gap. Our whole prompt strategy is built to keep the expensive
  context block a *cache hit*.
- **Streaming** for a real chat feel: function relays DeepSeek's token stream straight to the browser.

## 3. The caching strategy (the core design constraint)

DeepSeek caches the **longest identical leading token prefix** of each request automatically (no
markers). Hits bill ~$0.0028/1M, misses ~$0.14/1M. So we assemble every request **stable → volatile**:

```
message[0] = system:  [ FROZEN coach instructions ]      never changes      → HIT
                      + [ athlete profile + memories ]    changes slowly     → HIT
                      + [ training summary (e1RM/PRs) ]    per session        → HIT in-session
message[1..n] = the conversation so far (user/assistant)  append-only        → earlier turns HIT
message[n+1]  = the new user question                     always new         → MISS (tiny)
```

Rules enforced in the function:
1. **Frozen system instructions** — a constant string; never interpolate dates/IDs/names into it.
2. **Deterministic serialization** — memories sorted by `createdAt`, exercises in canonical order,
   numbers rounded consistently. Byte-identical context across turns ⇒ cache hit.
3. **Append-only conversation** — never edit/re-summarize earlier turns mid-chat.
4. **Volatile last** — the new question and any "today is …" note go at the end.
5. Memory writes happen at end-of-exchange (extraction), so the in-chat prefix stays stable.

Effect: after the first turn, the multi-thousand-token context is read at hit price; only the small
new question + output are full price. A coaching turn costs a few hundredths of a cent.

## 4. Components

```
js/coach.js (frontend)
  • Panel 4 chat UI: message list, composer, streaming render, thinking dots, empty state
  • calls COACH_ENDPOINT with the Firebase ID token; streams the reply
  • persists the chat thread locally (per device); context/memory lives server-side
  • DEV STUB: with no endpoint configured, returns a canned streamed reply so the UI works offline

functions/ (backend — Firebase Functions v2, Node 20)
  • coach (onRequest, streaming):
      verify Firebase ID token → load entries+memories+prefs (Admin SDK) →
      compute training summary → build cache-optimized messages → POST DeepSeek (stream:true) →
      relay token deltas to the browser → then best-effort memory extraction → end
  • DeepSeek call: https://api.deepseek.com/chat/completions (OpenAI-compatible), key from a Secret
  • memory extraction: a cheap non-stream JSON call over the latest exchange →
      durable facts → users/{uid}/memories (server-side write; no client rules change)

Firestore (existing project)
  users/{uid}/entries/*        ← workout sets (already written by the app in cloud mode)
  users/{uid}/memories/{id}    ← {text, kind: sleep|nutrition|injury|preference|goal|note, createdAt}
                                  (written only by the function; never read by the client)
```

## 5. Frontend (Panel 4 "Coach")

- A 4th scroll-snap panel + a 4th dock button (chat-bubble glyph). Accent color `--coach` (calm blue),
  distinct from the day colors to signal "different mode". Inherits the active theme.
- Layout: header (title + gear) · scrollable message list · composer (text input + send) pinned above
  the floating dock; dock auto-hides on input focus (existing behavior).
- Bubbles: user (right, accent), coach (left, surface). Streaming reply appends tokens live with a
  caret; a 3-dot "thinking" indicator until the first token.
- Empty state: a short prompt + 3 example chips ("Why did my bench stall?", "What should I focus on
  this week?", "Is my volume too high?").
- Requires sign-in (the function needs server-side data access). If somehow not signed in, show a
  "sign in to use your coach" state. Before the endpoint is configured → dev-stub demo replies.

## 6. Backend prompt (persona)

System persona: an expert, encouraging strength coach. It is given the athlete's profile + memories +
a compact training summary and told to: answer with specific numbers from the data; when diagnosing a
performance dip, ask 1–2 lifestyle follow-ups (sleep, nutrition, stress, soreness) rather than
guessing; be concise and actionable. It must not invent data it wasn't given.

Training summary computed server-side per exercise: current e1RM (Epley `w*(1+r/30)`), best e1RM,
% change since first, last 3 sessions, sessions count, and any recent PR.

## 7. Cost & limits (DeepSeek V4)

cache-hit $0.0028/1M · cache-miss $0.14/1M · output $0.28/1M · concurrency 2,500. At ~10 users this is
cents/month and never approaches the concurrency cap. The purchased credits last effectively forever
for this usage. V4-Pro is available for deeper reasoning at ~3× output cost / 500 concurrency — not
needed for v1; the model id is a one-line config switch.

## 8. Build order

1. Plan (this file).
2. Frontend shell: 4th panel + dock button + nav; `--coach` token; chat CSS.
3. `js/coach.js`: chat state, streaming client, dev stub, local thread persistence.
4. `cloud.js`: expose `getIdToken()`.
5. `functions/`: coach function (stream + context + extraction) + `firebase.json` + secret wiring.
6. SW cache bump; syntax + CSS checks.
7. Verify the chat UI via headless render against the dev stub (no key needed).
8. Integration instructions for the owner (DeepSeek key → Firebase secret → deploy → set endpoint).

## 9. Integration (owner does this — see end of build)

1. DeepSeek: copy the API key for the credits already purchased; confirm the exact V4 model id.
2. Firebase: upgrade project to **Blaze** (pay-as-you-go; free tier covers this — set a budget alert).
3. `firebase functions:secrets:set DEEPSEEK_API_KEY` ; set the model id if not `deepseek-chat`.
4. `firebase deploy --only functions` → copy the function URL.
5. Paste the URL into `COACH_ENDPOINT` in `js/coach.js`; rebuild the zip; re-drop on Netlify.

## 10. Out of scope (v1)

Cross-device chat history sync (local per device for now), voice, multi-exercise comparison charts in
chat, RAG embeddings/vector search (context-stuffing is sufficient at one-person scale), streaming the
memory-extraction step to the UI.
