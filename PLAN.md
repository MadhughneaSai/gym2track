# Workout Tracker — Master Plan (v1)

Written 2026-06-12. This is the canonical spec for the build. Personal app for one user;
optimized for fluidity on mobile Safari/Chrome, deployed as a plain static site.

> **STATUS (2026-06-12): v1 built + cloud layer added + beautification pass.**
> - **v1**: 3 panels, both history views, both chart views, cell sheet, save flow — verified.
> - **Forearm split**: `forearm-curl` → "Overhand Forearm" + new `forearm-curl-under`
>   "Underhand Forearm" (pull day now 5 exercises). Original id kept so logged sets persist.
> - **Cloud (Firebase Auth + Firestore)**: `js/cloud.js` (dynamic-imported SDK), auth gate,
>   per-user Firestore (`users/{uid}/entries`), offline persistent cache, live snapshot sync,
>   one-time local→cloud migration offer, account/sign-out in data sheet. `firestore.rules`
>   + `FIREBASE_SETUP.md` written. **Graceful fallback**: with no config in `cloud.js`,
>   app runs exactly as before on localStorage (verified: gate hidden, 0 errors).
>   *Blocked on owner pasting the Firebase config object (see FIREBASE_SETUP.md).*
> - Dev hooks: `?seed ?panel=N ?hview=focus ?pmode=detail ?exday=ID ?ex=ID ?authpreview`.
> - Preview: `python3 -m http.server 8788`, then http://127.0.0.1:8788/?seed
> - Pending: owner's desktop feature wishlist (§10).

## 17. Theme exploration outcome (2026-06-12)

Multi-agent exploration (4 research agents → 3 directions → build+render → dual-lens review → decision):
- **3 directions built** as drop-in themes (`themes/<slug>.css` + `.js`, loaded via `?theme=` or `DEFAULT_THEME`):
  **Quiet Steel** (calm Apple-clean), **Voltage** (athletic neon-but-tasteful), **Atelier** (premium editorial glass).
- **Dual-lens review** (22yo gym-goer = excitement; ex-Apple critic = refinement/smoothness):
  Voltage exc7/ref6/smo7 · **Atelier exc8/ref6/smo4** · Quiet Steel exc7/ref7/smo6.
- **Winner: Atelier** — only one both exciting AND premium-by-construction (real glass thickness ladder,
  lit edges, layered shadows, serif display, IO reveal cascade). Quiet Steel = the colorless-but-safe option
  the owner rejected; Voltage tipped gaudy (neon, kitsch stars, watermark, invisible-value bug).
- **Refine pass applied to Atelier** (now `DEFAULT_THEME='atelier'`): tamed 3 corner auroras → one calm field +
  single active-day top wash (one accent/screen, preserving the day-color identity system — did NOT collapse to
  one accent as the critic suggested, since push/legs/pull color = a deliberate orientation device); muted
  down-deltas to neutral; removed PR-star/dot bloom; sequenced chart reveal; lifted card glass for contrast;
  added a tactile SAVE payoff in the toast (animated check every save; day-color glow + shimmer + NEW PR badge
  only on a genuine PR, detected by reading state — opt-in, reduced-motion safe). Verified: PR vs routine toast,
  saves persist, 0 console errors. Other two themes remain previewable via `?theme=voltage` / `?theme=quiet-steel`.
- Render/montage tooling: /tmp/wt-render.mjs (CDP, watchdog) + /tmp/wt-montage.py.

## 16. Visual design language ("life" pass — 2026-06-12)

Goal from owner: less bland, more alive — color, aesthetics, smoothness; Apple-inspired.
Principles (kept tasteful, not gaudy — depth + motion + selective color, not rainbow):
- **Ambient color**: each panel sits on a soft radial gradient glow (day-tinted on Log/
  Progress) so the canvas is never flat black. Replaces dead `#0B0C0F` voids.
- **Material depth**: surfaces get a top inner-highlight hairline + faint gradient so cards
  read as lit physical chips (Apple's layered material feel), not flat rectangles.
- **Vivid day identity**: day cards carry a real color wash + glow in their day color; the
  coral/violet/mint system goes from accent-only to a felt presence.
- **Motion = life**: staggered cascade entrances (cards rise+fade in sequence), chart line
  draws on, reps bars grow up, numbers settle. Spring-y press feedback. All transform/opacity,
  60fps, `prefers-reduced-motion` respected. Scrub redraw must NOT replay draw-on (animate flag).
- **Typography**: confident display numerals; gradient-filled hero stats; tighter tracking.
- **Glow accents**: PR stars glow; save/submit buttons have a colored soft shadow.

---

## 0. Product summary

A three-panel, horizontally swipeable web app:

1. **Log** — enter a set: pick day (Push / Legs / Pull) → pick exercise (pictogram cards) → enter weight + reps. Date auto-captured.
2. **History** — date × exercise table of everything logged. Two views: **Grid** (full table) and **Focus** (one workout date at a time, row set adapts to that day's type).
3. **Progress** — pick an exercise, see a progress chart. Two views: **Strength** (single e1RM score line) and **Detail** (weight + e1RM lines and reps bars).

Constraints from owner:
- Single user. No auth, no backend, no scaling, no security work.
- Mobile browser first (mostly Safari on iPhone). Desktop secondary, but History table + Progress chart must be good on laptop.
- Fluidity is the #1 priority. Native-feel scrolling, 60fps, no jank.
- Deploy = drop a folder on any static host (Netlify/GitHub Pages/Vercel).

---

## 1. Decisions made on the owner's behalf (review these)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Units are **lb**, fixed | Owner speaks in lb. Constant in one place; kg toggle is a later one-liner. |
| 2 | Multiple entries for the same exercise+date are **stored**, but table/chart display the **top set** (highest e1RM) | Keeps the table one Weight\|Reps pair per date as specified; protects data; mistakes are fixed by deleting an entry via the cell sheet. |
| 3 | Table dates run **newest → oldest, left → right** | Matches owner's description ("Jun 12 first column, then Jun 2/3"); latest data visible with zero scrolling. |
| 4 | Progress score = **estimated 1-rep max (Epley)** | The industry-standard answer to "how do I compare 140×13 vs 160×10". See §9. |
| 5 | Chart x-axis = **per-session ordinal spacing** with date labels (not true time scale) | Workouts are sparse/irregular; true time spacing makes vacation gaps dominate the picture. Goal is comparing session-to-session performance. |
| 6 | **Dark theme** only in v1 | Gym lighting, OLED phones, glare. Tokens make a light theme cheap later. |
| 7 | App opens on the **Log** panel | Most frequent task — owner opens the app at the gym to enter a set. |
| 8 | Focus mode = **snap-one-date-at-a-time** deck whose visible rows/labels swap to the snapped date's day-type | Implements the dynamic-left-subheading behavior; snapping avoids rows appearing/vanishing mid-scroll (janky, disorienting). Only active dates exist as snap stops, so "jump to next active day" is inherent. |
| 9 | **No framework, no build step** — vanilla HTML/CSS/JS (ES modules) | Fastest possible load + interaction on phone; zero tooling; deploy = copy folder. |
| 10 | **PWA-lite + offline cache + JSON export/import** | "Add to Home Screen" gives the app feel without a developer license; offline cache means it opens instantly in a gym basement with no signal; export protects against Safari storage eviction. |

Open item: owner will specify desktop feature wishes later — §10 holds sensible defaults until then.

---

## 2. Stack & architecture

- Vanilla HTML + CSS + JS, ES modules, **no build step**. Rationale: 3 screens, one user; framework runtime + tooling buys nothing and costs startup ms on phone.
- Charts: **hand-rolled SVG** (no chart library). Full control over the custom dual-view design, tiny payload, crisp on retina, easy touch scrubbing.
- Storage: **localStorage**, one JSON document, versioned. In-memory store, save on mutation.
- PWA: `manifest.webmanifest` + small service worker (cache-first for all assets).
- Hosting: any static host with HTTPS (required for the service worker).

```
workout tracker/
  index.html            — single page; 3 panels + dock; loads modules
  styles.css            — design tokens + all styles
  js/
    app.js              — boot, pager/dock sync, panel wiring
    state.js            — store, persistence, selectors, e1RM math
    exercises.js        — canonical day/exercise catalog
    icons.js            — 14 inline SVG exercise pictograms + UI glyphs
    log.js              — Panel 1 (entry wizard)
    history.js          — Panel 2 (grid + focus views, entry sheet)
    progress.js         — Panel 3 (selector, chart render, scrub)
  manifest.webmanifest
  sw.js
  icons/ (app icon pngs: 180, 192, 512)
```

---

## 3. Data model

localStorage key `workout:v1`:

```json
{
  "version": 1,
  "entries": [
    { "id": "uuid", "date": "2026-06-12", "day": "push",
      "exercise": "chest-fly", "weight": 100, "reps": 10, "t": 1781234567890 }
  ],
  "prefs": {
    "historyView": "grid",
    "progress": { "day": "push", "exercise": "chest-fly", "mode": "strength", "range": "all" },
    "lastInput": { "chest-fly": { "weight": 100, "reps": 10 } }
  }
}
```

Rules:
- `date` key is built from **local** date parts (`getFullYear/getMonth/getDate`), never `toISOString()` (UTC would mislabel late-night workouts).
- `day` is denormalized onto each entry (also derivable from exercise) — convenient for grouping.
- `id` = `crypto.randomUUID()`. `t` = entry timestamp for ordering within a day.
- Save = serialize whole doc on each mutation (data volume is trivial: years ≈ a few thousand entries).

Selectors (state.js):
- `activeDates()` → sorted unique dates with ≥1 entry.
- `entriesFor(date, exercise)` → raw list.
- `topSet(date, exercise)` → entry with max e1RM (display rule, decision #2).
- `dayTypesOf(date)` → set of day types logged that date (normally exactly one).
- `seriesFor(exercise)` → `[{date, weight, reps, e1rm}]` of top sets, date ascending (charts).
- `prevTopSet(exercise, beforeDate)` → for delta chips in Focus view.
- `epley(w, r)` = `w * (1 + r / 30)` — the single strength formula, one constant, swappable.

---

## 4. Exercise catalog (canonical — exact order as specified)

**Push** — color `#FF6B5E` (coral)
| # | id | Display name | Pictogram depicts |
|---|----|--------------|-------------------|
| 1 | `chest-fly` | Chest Fly | Pec-deck machine: seated figure, arms arcing together |
| 2 | `incline-press` | Incline Press | Incline bench, dumbbells pressed up-forward (upper chest) |
| 3 | `triceps-pushdown` | Triceps Pushdown | Standing figure pushing a cable bar down |
| 4 | `lateral-raise` | Lateral Raise | Standing figure, cable raised out to the side |
| 5 | `shoulder-press` | Shoulder Press | Seated figure pressing dumbbells overhead |

**Legs** — color `#8B7CFF` (violet)
| 1 | `leg-extension` | Leg Extension | Seated machine, shins raising the pad |
| 2 | `hamstring-curl` | Hamstring Curl | Lying machine, heels curling the pad |
| 3 | `calf-raise` | Calf Raise | Standing calf machine, heels raised |
| 4 | `back-extension` | Back Extension | 45° pad, figure hinging back up |
| 5 | `ab-crunch` | Ab Crunch | Seated crunch machine |

**Pull** — color `#38D9A9` (mint)
| 1 | `chest-supported-row` | Supported Row | Chest on incline pad, barbell row |
| 2 | `lat-pulldown` | Lat Pulldown | Seated, wide bar pulled to chest |
| 3 | `bicep-curl` | Barbell Curl | Standing barbell curl |
| 4 | `forearm-curl` | Forearm Curl | Wrist curl, forearm on bench |

Icon style: 48×48 viewBox, consistent 2px round-cap strokes, `currentColor` so each
tints with its day color; simple figure-on-machine line art. 14 total, hand-drawn in `icons.js`.

---

## 5. Design system

**Principles applied (the "why" behind placements):**
- Thumb zone / Fitts's law: primary navigation and the Save button live at the bottom of the viewport where the thumb rests; destructive/rare actions live top corners (harder to reach on purpose).
- Progressive disclosure: entry is a 3-step wizard (day → exercise → numbers) — one decision per screen, no scrolling forms.
- Recognition over recall: machines are picked from pictograms, not text lists.
- Apple HIG: every tap target ≥ 44×44pt.
- Doherty threshold: every tap answers in <100ms with visible state change (press scale, instant step transitions, optimistic save + toast).
- Consistency: the day colors (coral/violet/mint) are the single orientation system across all three panels — chips, table section headers, focus cards, chart lines all inherit them.
- Smart defaults (Tesler): weight/reps prefill from the last session of that exercise; date auto-filled; most repeat sessions are 3 taps + save.

**Tokens:**
- Background `#0B0C0F`, surface `#15161B`, surface-2 `#1D1F26`, hairline `#272A32`
- Text `#F2F3F5` / secondary `#9BA1AC` / faint `#5C636E`
- Day colors: push `#FF6B5E`, legs `#8B7CFF`, pull `#38D9A9` (+ 12% alpha tint variants for fills)
- Type: system stack (`-apple-system, SF Pro, Segoe UI, Roboto`); display 34/600 for big numerals, title 20/600, body 15/400, caption 12/500 uppercase tracking for labels; `font-variant-numeric: tabular-nums` everywhere numbers align (table, steppers, axes).
- Space: 4px grid. Radii: 12 (controls) / 16 (cards) / 24 (sheets). Hairline borders + very soft shadows (dark theme depth comes mostly from surface steps).
- Motion: 240ms `cubic-bezier(0.32, 0.72, 0, 1)` for slides (iOS feel), 180ms fades, press scale `0.97`. Transform/opacity only — never animate layout. `prefers-reduced-motion` → fades only.

---

## 6. App shell — pager + dock

- The three panels sit in a horizontal **CSS scroll-snap** track (`scroll-snap-type: x mandatory`), each `100dvw × 100dvh`. Native momentum scrolling = the most fluid swipe physics available on iOS; no JS animation library can match it.
- **Bottom dock**: floating pill, centered, above `env(safe-area-inset-bottom)`. Three items: **Log** (plus glyph), **History** (grid glyph), **Progress** (chart glyph). A sliding active indicator tracks the pager's `scrollLeft` proportionally (rAF-throttled passive scroll listener, transform-only). Tap → `scrollTo({behavior:'smooth'})`.
- Panel content scrolls **vertically** inside each panel; the pager owns horizontal.
- **Gesture-conflict rule (critical):** every nested horizontal scroller (History table, Focus deck, exercise chip rows) gets `overscroll-behavior-x: contain` so reaching its edge never chain-scrolls the pager. Page switching from those areas = dock taps. Vertical areas use default chaining.
- Desktop: ←/→ arrow keys switch panels; dock stays bottom-center (same muscle memory).

---

## 7. Panel 1 — Log

Three steps, slide transitions inside the panel, tap-driven only (no horizontal gesture, so no pager conflict). Header always shows **today** ("Thu, Jun 12") — date is automatic, per spec.

**Step A — Day.** Three large stacked cards in canonical order Push → Legs → Pull. Each card: day color edge/tint, name, mini icon strip of its exercises, count ("5 exercises"). One tap advances.

**Step B — Exercise.** Day chip header (colored) + back chevron (top-left). 2-column grid of cards: pictogram + name. Exercises **already logged today get a ✓ badge** (and show today's top set under the name) — the owner can see at a glance what's left in the session. One tap advances.

**Step C — Weight & reps.** The money screen:
- Hero: pictogram + exercise name + day chip.
- **Weight stepper**: huge tabular numeral, − / + buttons (44pt+), step **5**, long-press auto-repeat with acceleration. Tapping the number opens direct numeric entry (`inputmode="decimal"`, font-size ≥16px to prevent iOS zoom).
- **Reps stepper**: same pattern, step **1**.
- Prefill = last logged values for this exercise (`prefs.lastInput`); hint line under steppers: "Last: 120 lb × 10 · Jun 5".
- **Save**: full-width, day-colored, in the thumb zone. On save: toast "Logged Chest Fly — 120 lb × 10", auto-return to **Step B** with the ✓ badge now lit — because the next action is almost always logging the next exercise of the same session.
- Re-logging the same exercise/date just appends (decision #2); deleting mistakes happens in History's cell sheet.

Tap budget for a repeat session: 1 (day) + 1 (exercise) + 0–4 (nudges) + 1 (save) ≈ **3–7 taps per exercise**.

---

## 8. Panel 2 — History

Header: title + view toggle (segmented: **Grid | Focus**) + "⋯" button (export/import/clear sheet).

### Grid view (full table)
- One scroll container, both axes. **Sticky left rail** (exercise names), **sticky two-row header** (row 1: date spanning 2 sub-columns; row 2: `lb | reps`), corner cell sticky on both axes.
- Rows in canonical order: **PUSH** section header row (coral, sticky-left label), its 5 exercises; **LEGS** (violet) + 5; **PULL** (mint) + 4. Section headers also sticky-left.
- Columns: **only active dates** (no empty calendar days), **newest at the left** (decision #3). Date header: "Jun 12" + weekday + a small dot in the day-type color logged that date.
- Cell = top set: weight in the `lb` sub-cell, reps in the `reps` sub-cell; filled cells get a faint day-color tint; empty cells show a faint "·".
- **Tap a filled cell → bottom sheet**: all raw entries for that exercise+date (weight × reps + time), each with delete; "Log again" shortcut jumps to Panel 1 Step C pre-selected. This is the single correction path — keeps Panel 1 pure.
- Sizing: rail ~132px; date column 112px (2×56) mobile, 132px desktop; row height 44px. Rail gets a soft shadow once `scrollLeft > 0` (scroll-edge affordance).
- Perf: plain DOM table-grid (data scale is tiny), `contain: content` on the scroller, tabular numerals, no virtualization needed.

### Focus view ("optimized view")
- Premise: a given date has exactly one day type, so show **one date at a time** and adapt the row set to it.
- A horizontal **snap deck** (`scroll-snap-align: center`, `overscroll-behavior-x: contain`): one card per **active date**, newest first, neighbors peeking at the edges. Swiping left goes to the next active workout date — the "jump to next active day" is inherent because only real workout dates exist as snap stops.
- A sticky **context bar** above the deck updates live on snap (via IntersectionObserver / `scrollend`): e.g. "**Pull** · Tue Jun 10" with day color — this is the dynamically-changing subheading.
- Card anatomy: date + day chip header; then that day-type's exercises as rows: mini pictogram, name, **120 lb × 10**, and a **delta chip** vs that exercise's previous session (▲ +5 lb / ▲ +2 reps / — same / ▼), computed weight-first then reps.
- Edge case: a date with two day types logged shows both sections stacked on the card.
- Row-set changes happen *between* snapped cards (each card owns its rows), never under the finger mid-scroll — that's why this beats a literal morphing-rail table (decision #8).

### Desktop
Full-bleed up to ~1280px; many date columns visible; hover paints a row+column crosshair highlight; horizontal scroll via trackpad / Shift+wheel; Focus cards widen (~420px) with 2–3 visible.

---

## 9. Panel 3 — Progress

### Selector (built for rapid switching, unlike Panel 1's deliberate wizard)
Sticky at top: a 3-chip day segmented control (day-colored) + a horizontal exercise chip row (pictogram + short name, snap, overscroll-contain). Same icons/colors as Panel 1 — same mental model, different optimization: analysis means hopping between exercises, so the picker stays visible instead of being a wizard. Last selection persists (`prefs.progress`).

### The progress metric (the core reasoning)
- Problem (owner's own example): plain volume `weight × reps` is linear, so 140×13 (1820) vs 160×10 (1600) over-rewards rep-grinding and can't honestly compare different weight/rep combos.
- Solution: **estimated one-rep max** — the standard strength-training answer to exactly this question (what Strong/Hevy/etc. chart). **Epley: `e1RM = weight × (1 + reps/30)`**. It maps any (weight, reps) pair onto one comparable scalar — "the most you could lift once" — and is non-linear in exactly the way the owner intuited: each extra rep at a higher weight is worth more (each rep adds `weight/30` lb of score).
- Worked example with his numbers: 140×10 → **186.7**. Two weeks later 160×10 → **213.3** = **+14.3%** real progress, even though reps stayed at 10 (the flat-line problem with reps-only or weight-only views is solved). And 140×13 → 200.7, so the formula judges 160×10 slightly ahead of 140×13.
- Honesty guards: above ~15 reps the estimate degrades — render those points with a "~" qualifier in the tooltip. Per date, the charted value is the **top set** (max e1RM), consistent with the table. The formula lives in one function; if his lived experience disagrees, the constant (or a switch to Brzycki `w × 36/(37−r)`) is a one-line change.
- Crucially, the score never hides ground truth: the Detail view and the scrub tooltip always show the raw weight × reps next to it.

### View 1 — Strength (default)
Single **e1RM line**: monotone-cubic curve (no fake overshoot), dots on points, soft gradient area fill in the day color, subtle glow. **PR markers**: a small star on every new all-time-high. 4–5 hairline gridlines, y-range padded ±5% and rounded to clean 5s.

### View 2 — Detail (the "three series" view)
- **Weight** (solid line) and **e1RM** (dashed accent line) share **one lb axis** — same unit, no dual-axis lying. The vertical gap between the two lines *is* the reps contribution, made visible.
- **Reps** as soft small bars in a slim band along the bottom, own 0→max scale, value labels shown for the scrubbed point.
- Legend chips above the chart; segmented toggle **Strength | Detail**.

### Shared chart behavior
- X-axis: ordinal per-session spacing (decision #5), thinned date labels ("Jun 10"), first/last always labeled.
- **Scrub**: pointer-drag shows a crosshair + snapped highlighted point + a fixed readout row above the chart ("Tue Jun 10 · 160 lb × 10 · e1RM 213"). The chart area sets `touch-action: none`; everything around it scrolls normally.
- Range control: **All | 3M | 1M**.
- **Stat strip** above the chart (big numerals): Current e1RM · Best · Δ since first (+%) · Sessions.
- Empty states: 0 points → pictogram + "No sets logged yet" + button that smooth-scrolls the pager to Log; 1 point → single big stat card ("first benchmark set"), no line.
- Rendering: hand-rolled SVG sized to container via ResizeObserver, recomputed on resize (crisp text, no scaling blur).

---

## 10. Desktop adaptations (defaults until owner specifies wishes)

- ≥900px: Log content max-width 560 centered; History up to ~1280; Progress chart ~960×420.
- ←/→ switch panels; hover states gated behind `@media (hover: hover)`; table crosshair hover; chart hover = scrub.
- Dock remains bottom-center (identical muscle memory mobile/desktop).

## 11. Mobile engineering checklist (fluidity contract)

- `100dvh` + `viewport-fit=cover` + safe-area insets (dock, sheets).
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- All inputs ≥16px font + `inputmode` numeric/decimal (no iOS focus-zoom, right keyboard).
- `touch-action: manipulation` globally (kills double-tap zoom delay); `touch-action: none` only on the chart scrub surface.
- `overscroll-behavior-x: contain` on every nested horizontal scroller (pager protection).
- `-webkit-tap-highlight-color: transparent`; visible custom press states instead.
- Animations: transform/opacity only; passive listeners; rAF-throttle scroll syncs; `contain: content` on heavy scrollers.
- Hide dock while a text input is focused (keyboard overlap), restore on blur.

## 12. PWA & data safety

- `manifest.webmanifest`: name "Workout", `display: standalone`, dark `background_color`/`theme_color`, 192/512 icons + `apple-touch-icon` (180).
- `sw.js`: cache-first precache of all assets, version-keyed; instant offline launches (gyms have bad signal).
- iOS install: Share → Add to Home Screen → full-screen app, more durable storage.
- "⋯" sheet on History: **Export JSON** (downloads `workout-backup-YYYY-MM-DD.json`), **Import JSON** (replace, with confirm), **Clear all** (double-confirm). Export exists because iOS can evict localStorage of long-unvisited sites — one tap monthly = safe.

## 13. Build order (with verify gates)

1. Scaffold: index.html, tokens, pager + dock + indicator sync. *Verify: swipe/tap/keys on phone-size viewport.*
2. `exercises.js` + all 14 pictograms in `icons.js`. *Verify: icon sheet render.*
3. `state.js`: schema, persistence, selectors, epley, temporary seed-data flag for development.
4. Panel 1 wizard end-to-end (writes real entries). *Verify: log flow ≤7 taps, prefill works.*
5. Panel 2 Grid: sticky rail/header/corner, sections, cells, cell sheet + delete. *Verify on small viewport + desktop width.*
6. Panel 2 Focus: deck, context bar, deltas.
7. Panel 3: selector + Strength view + stat strip.
8. Panel 3: Detail view + scrub + ranges + empty states.
9. PWA (manifest, SW, icons) + export/import + motion/empty-state polish + desktop pass.
10. Final sweep: remove seed data, Safari-quirk pass (sticky corner, dvh, sheet scroll), iPhone-size screenshot review of all states.

## 14. Risks & mitigations

- **Nested horizontal scroll vs pager** → `overscroll-behavior-x: contain` everywhere horizontal (tested first, step 1/5); dock always works regardless.
- **Sticky corner cell in Safari** → known-good pattern (single cell, `position: sticky; top:0; left:0; z-index` above rail+header); verify early in step 5.
- **localStorage eviction on iOS** → export/import + PWA install guidance (§12).
- **Keyboard vs fixed dock** → dock hidden on input focus (§11).
- **e1RM not matching felt effort** → formula isolated in one function; Detail view always shows raw truth.

## 15. Explicitly out of scope (v1)

Accounts/sync, kg toggle, per-set history view beyond the cell sheet, rest timers, custom exercises/editing the catalog, light theme, CSV, charts across multiple exercises. Desktop feature wishlist: pending owner input.
