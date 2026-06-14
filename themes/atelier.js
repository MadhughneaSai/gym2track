/* ============================================================
   ATELIER — theme JS (ES module, defensive, never throws)
   Adds editorial life:
     · staggered fade-up reveal cascade (IntersectionObserver)
     · sticky-header parallax (scroll-driven, throttled)
     · pager-driven active-day hue warming the field
     · dock recede when a sheet opens
     · long-press on .chart-card -> generated "training spread"
   All effects feature-detect; failures degrade to the base look.
   ============================================================ */

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

try {
  // marks that JS is live so CSS can safely hide-then-reveal (no FOUC if JS fails)
  root.classList.add('atelier-js');

  /* ---- feature-budget guard: drop grain on weak devices ---- */
  // hardwareConcurrency is a cheap proxy; very low core counts => skip the soft-light layer.
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 2) root.classList.add('atelier-lite');
} catch {}

/* ============================================================
   1 · REVEAL CASCADE  — stagger items as they enter the viewport
   ============================================================ */
function setupReveals() {
  if (reduce || !('IntersectionObserver' in window)) {
    // reduced-motion path: CSS forces everything visible; just tag .in defensively
    document.querySelectorAll('.ex-card, .focus-card, .stat, .day-card, .htable tbody tr')
      .forEach(el => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
    }
  }, { root: null, threshold: 0.06, rootMargin: '0px 0px -4% 0px' });

  // FAILSAFE: an entrance animation must never leave content invisible. If the
  // observer hasn't revealed an element shortly after it mounts (Safari/PWA timing,
  // off-screen panels, async cloud data), force it visible.
  const reveal = el => { el.classList.add('in'); try { io.unobserve(el); } catch {} };

  // give each group a fresh stagger index, capped so the cascade stays ~<300ms total
  function indexGroup(nodes) {
    let i = 0;
    for (const el of nodes) {
      if (el.dataset.atReveal) { io.observe(el); continue; }
      el.dataset.atReveal = '1';
      el.style.setProperty('--i', Math.min(i, 6)); // cap at 6 -> 264ms max delay
      io.observe(el);
      // if it's already on screen right now, reveal immediately (don't await the async cb)
      try { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) reveal(el); } catch {}
      setTimeout(() => reveal(el), 1200); // belt-and-suspenders: never stay hidden
      i++;
    }
  }

  function scan() {
    try {
      indexGroup(document.querySelectorAll('.ex-grid .ex-card'));
      indexGroup(document.querySelectorAll('.focus-deck .focus-card'));
      indexGroup(document.querySelectorAll('.stat-strip .stat'));
      indexGroup(document.querySelectorAll('#log-steps .day-card'));
      indexGroup(document.querySelectorAll('.htable tbody tr'));
    } catch {}
  }

  // the app re-renders panel bodies on navigation/state change; observe those mounts
  scan();
  const targets = ['#log-steps', '#history-body', '#progress-body'].map(s => document.querySelector(s)).filter(Boolean);
  const mo = new MutationObserver(() => requestAnimationFrame(scan));
  targets.forEach(t => mo.observe(t, { childList: true, subtree: true }));
}

/* ============================================================
   2 · STICKY-HEADER PARALLAX  — head scales down as content scrolls
   prefer scroll-driven CSS; fall back to a throttled rAF reader.
   ============================================================ */
function setupParallax() {
  if (reduce) return;
  const scrolls = document.querySelectorAll('.panel-scroll');
  scrolls.forEach(sc => {
    const head = sc.querySelector('.panel-head');
    if (!head) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      // 0 at top -> 1 by 80px of scroll
      const sh = Math.min(1, Math.max(0, sc.scrollTop / 80));
      head.style.setProperty('--sh', sh.toFixed(3));
    };
    sc.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    apply();
  });
}

/* ============================================================
   3 · PAGER-DRIVEN DAY HUE  — warm the field with the active day
   reads the selected day-chip / active picker as the page scrolls.
   ============================================================ */
function setupFieldHue() {
  const pager = document.getElementById('pager');
  if (!pager) return;

  const pick = () => {
    try {
      const w = pager.clientWidth || 1;
      const panel = Math.round(pager.scrollLeft / w);
      let day = null;
      if (panel === 0) {
        // Log: the visible day-chip or a focused day-card
        const chip = document.querySelector('#log-steps .day-chip');
        if (chip) day = guessDay(getVar(chip, '--c'));
      } else if (panel === 2) {
        const active = document.querySelector('.picker-days .pd-btn.is-active');
        if (active) day = active.dataset.day || guessDay(getVar(active, '--c'));
      } else {
        const fc = document.querySelector('.focus-context');
        if (fc) day = guessDay(getVar(fc, '--c'));
      }
      if (day) root.setAttribute('data-day', day);
    } catch {}
  };

  let ticking = false;
  pager.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; pick(); });
  }, { passive: true });

  // also react to in-panel taps that change the active day
  document.addEventListener('click', () => requestAnimationFrame(pick), { passive: true });
  pick();
}

function getVar(el, name) {
  try { return getComputedStyle(el).getPropertyValue(name).trim(); } catch { return ''; }
}
function guessDay(color) {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('255, 107') || c.includes('ff6b')) return 'push';
  if (c.includes('139, 124') || c.includes('8b7c')) return 'legs';
  if (c.includes('56, 217') || c.includes('38d9')) return 'pull';
  return null;
}

/* ============================================================
   4 · SHEET RECEDE  — dock blurs back when a bottom sheet opens
   watch the shared .sheet element's open class (no shared-file edit).
   ============================================================ */
function setupSheetRecede() {
  const sheet = document.getElementById('sheet');
  if (!sheet || !('MutationObserver' in window)) return;
  const sync = () => root.classList.toggle('atelier-sheet-open', sheet.classList.contains('open'));
  new MutationObserver(sync).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  sync();
}

/* ============================================================
   5 · HERO — long-press .chart-card -> generated training spread
   a self-contained SVG "editorial figure", built from DOM + state.
   ============================================================ */
function setupSpread() {
  let timer = null, downXY = null;

  document.addEventListener('pointerdown', e => {
    const card = e.target.closest?.('.chart-card');
    if (!card) return;
    downXY = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = null; openSpread(card); }, 520);
  }, { passive: true });

  const cancel = e => {
    if (timer && downXY && e && (Math.abs(e.clientX - downXY.x) > 10 || Math.abs(e.clientY - downXY.y) > 10)) {
      clearTimeout(timer); timer = null;
    }
  };
  document.addEventListener('pointermove', cancel, { passive: true });
  document.addEventListener('pointerup', () => { clearTimeout(timer); timer = null; }, { passive: true });
  document.addEventListener('pointercancel', () => { clearTimeout(timer); timer = null; }, { passive: true });
}

function readState() {
  // build the spread from on-screen, already-rendered data — no app imports needed
  const out = { ex: 'Training', day: 'push', dayColor: '#8B7CFF', now: '—', best: '—', delta: '—', sessions: '—' };
  try {
    const chip = document.querySelector('.picker-ex .pe-chip.is-active');
    if (chip) out.ex = chip.textContent.trim();
    const dayBtn = document.querySelector('.picker-days .pd-btn.is-active');
    if (dayBtn) { out.day = dayBtn.dataset.day || out.day; out.dayColor = getVar(dayBtn, '--c') || out.dayColor; }
    const stats = document.querySelectorAll('.stat-strip .stat .s-val');
    if (stats[0]) out.now = stats[0].textContent.trim();
    if (stats[1]) out.best = stats[1].textContent.trim();
    if (stats[2]) out.delta = stats[2].textContent.trim();
    if (stats[3]) out.sessions = stats[3].textContent.trim();
  } catch {}
  return out;
}

function openSpread(card) {
  try {
    if (document.querySelector('.atelier-spread')) return;
    const s = readState();
    const c = s.dayColor || '#8B7CFF';

    // pull the existing chart path so the spread mirrors the on-screen curve
    let curve = '';
    try {
      const p = card.querySelector('.chart-svg path.ln, .chart-svg path.fade');
      if (p) {
        const d = p.getAttribute('d') || '';
        const vb = (card.querySelector('.chart-svg')?.getAttribute('viewBox') || '0 0 360 300').split(/\s+/).map(Number);
        curve = `<g transform="translate(0 226) scale(${(312 / (vb[2] || 360)).toFixed(4)} ${(120 / (vb[3] || 300)).toFixed(4)})"><path d="${d}" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" opacity="0.9"/></g>`;
      }
    } catch {}

    const date = new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const W = 360, H = 460;
    const svg = `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Georgia, serif">
        <defs>
          <linearGradient id="atsp-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${c}" stop-opacity="0.26"/>
            <stop offset="1" stop-color="${c}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <text x="28" y="46" fill="rgba(255,255,255,0.4)" font-size="11" letter-spacing="3" font-family="-apple-system,sans-serif">A T E L I E R · T R A I N I N G</text>
        <line x1="28" y1="58" x2="${W - 28}" y2="58" stroke="rgba(255,255,255,0.12)"/>
        <text x="28" y="110" fill="rgba(255,255,255,0.95)" font-size="34" font-weight="700" font-family="Atelier Display, Didot, Georgia, serif">${esc(s.ex)}</text>
        <text x="28" y="134" fill="${c}" font-size="13" font-weight="600" letter-spacing="1.5" font-family="-apple-system,sans-serif">${esc(date.toUpperCase())}</text>

        <g font-family="-apple-system,sans-serif">
          <text x="28"  y="184" fill="rgba(255,255,255,0.4)" font-size="10" letter-spacing="2">E1RM NOW</text>
          <text x="200" y="184" fill="rgba(255,255,255,0.4)" font-size="10" letter-spacing="2">BEST</text>
        </g>
        <text x="28"  y="216" fill="rgba(255,255,255,0.95)" font-size="30" font-weight="700" font-family="Atelier Display, Didot, Georgia, serif">${esc(s.now)}</text>
        <text x="200" y="216" fill="${c}" font-size="30" font-weight="700" font-family="Atelier Display, Didot, Georgia, serif">${esc(s.best)}</text>

        <rect x="0" y="226" width="${W}" height="124" fill="url(#atsp-area)"/>
        ${curve}

        <line x1="28" y1="384" x2="${W - 28}" y2="384" stroke="rgba(255,255,255,0.12)"/>
        <g font-family="-apple-system,sans-serif">
          <text x="28"  y="414" fill="rgba(255,255,255,0.4)" font-size="10" letter-spacing="2">SESSIONS</text>
          <text x="200" y="414" fill="rgba(255,255,255,0.4)" font-size="10" letter-spacing="2">SINCE FIRST</text>
          <text x="28"  y="436" fill="rgba(255,255,255,0.92)" font-size="18" font-weight="700">${esc(s.sessions)}</text>
          <text x="200" y="436" fill="rgba(255,255,255,0.92)" font-size="18" font-weight="700">${esc(s.delta)}</text>
        </g>
      </svg>`;

    const bg = document.createElement('div');
    bg.className = 'atelier-spread-backdrop';
    const fig = document.createElement('div');
    fig.className = 'atelier-spread';
    fig.style.setProperty('--c', c);
    fig.innerHTML = svg;
    document.body.appendChild(bg);
    document.body.appendChild(fig);

    requestAnimationFrame(() => { bg.classList.add('open'); fig.classList.add('open'); });

    const close = () => {
      bg.classList.remove('open'); fig.classList.remove('open');
      setTimeout(() => { bg.remove(); fig.remove(); }, 360);
    };
    bg.addEventListener('click', close);
    fig.addEventListener('click', close);
  } catch {}
}

const esc = str => String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ============================================================
   6 · SAVE CONFIRMATION + opt-in PR celebration
   A conic ring sweeps + a check on every save (the tactile "win lands");
   on a GENUINE personal record the entry-hero gets a sweep + PR tag.
   PR detection imports the app's own selectors defensively — read-only.
   ============================================================ */
let _state = null;
import('../js/state.js').then(m => { _state = m; }).catch(() => {});

const DAY_COLOR = { push: '#FF6B5E', legs: '#8B7CFF', pull: '#38D9A9' };
const CHECK_SVG =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
  '<path class="at-check2" pathLength="1" d="M4.5 10.5l3.2 3.2L15.5 6.4"/></svg>';

// Inspect the just-saved set: returns { day, isPR } or null. Read-only on app state.
function lastSaveInfo() {
  try {
    if (!_state || !_state.allEntries) return null;
    const all = _state.allEntries();
    if (!all.length) return null;
    const latest = all.reduce((a, b) => (b.t > a.t ? b : a));
    if (!latest) return null;
    const prior = all.filter(e => e.exercise === latest.exercise && e.t < latest.t);
    const e1 = (w, r) => w * (1 + r / 30);
    const isPR = prior.length >= 1 && e1(latest.weight, latest.reps) > Math.max(...prior.map(e => e1(e.weight, e.reps))) + 0.01;
    return { day: latest.day, isPR };
  } catch { return null; }
}

// Decorate the toast as it appears: leading check on every save; PR flourish on a record.
function setupSaveConfirm() {
  const toast = document.getElementById('toast');
  if (!toast || !('MutationObserver' in window)) return;
  let busy = false;

  const decorate = () => {
    if (busy) return;                                    // ignore mutations we cause
    try {
      if (!toast.classList.contains('show')) return;
      if (toast.querySelector('.at-toast-ic')) return;   // already decorated this cycle
      const msg = (toast.textContent || '').trim();
      if (!/^Logged\b/.test(msg)) return;                // only save toasts

      busy = true;
      const info = lastSaveInfo();
      if (info && DAY_COLOR[info.day]) toast.style.setProperty('--c', DAY_COLOR[info.day]);

      toast.classList.remove('at-pr');
      toast.textContent = '';
      const ic = document.createElement('span');
      ic.className = 'at-toast-ic';
      ic.innerHTML = CHECK_SVG;
      const label = document.createElement('span');
      label.textContent = msg;
      toast.append(ic, label);

      if (info && info.isPR) {
        toast.classList.add('at-pr');
        const badge = document.createElement('span');
        badge.className = 'at-pr-badge';
        badge.textContent = 'NEW PR';
        toast.appendChild(badge);
        if (!reduce && navigator.vibrate) { try { navigator.vibrate([10, 40, 18]); } catch {} }
      } else if (!reduce && navigator.vibrate) {
        try { navigator.vibrate(8); } catch {}
      }
    } catch {}
    finally { busy = false; }
  };

  new MutationObserver(decorate).observe(toast, {
    attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true,
  });
}

/* ============================================================
   boot — run after the app's initial render settles
   ============================================================ */
function boot() {
  try { setupReveals(); } catch {}
  try { setupParallax(); } catch {}
  try { setupFieldHue(); } catch {}
  try { setupSheetRecede(); } catch {}
  try { setupSpread(); } catch {}
  try { setupSaveConfirm(); } catch {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(boot), { once: true });
} else {
  requestAnimationFrame(boot);
}

export {};
