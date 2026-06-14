/* ============================================================
   QUIET STEEL — theme JS. Restraint-first life:
   - sliding segmented-control pill (single translateX element)
   - per-panel active-day background hue
   - IntersectionObserver count-up on the 4 Progress stat tiles
   - Save "ring close" hero confirmation
   All defensive: feature-detect, never throw, no render-timing assumptions.
   ============================================================ */

const reduceMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- small helpers ---------- */
const raf = (fn) => (window.requestAnimationFrame || setTimeout)(fn);
function safe(fn) { try { fn(); } catch { /* never throw into the app */ } }

/* ============================================================
   1) SLIDING SEGMENTED-CONTROL PILL
   Drives --seg-x / --seg-w on each .seg from its active button.
   Segs are (re)rendered by the app, so we observe the DOM and
   re-measure on resize. Works for 2- and 3-button segments.
   ============================================================ */
function positionSegPill(seg) {
  safe(() => {
    const active = seg.querySelector('.seg-btn.is-active') || seg.querySelector('.seg-btn');
    if (!active) return;
    const pad = parseFloat(getComputedStyle(seg).paddingLeft) || 3;
    seg.style.setProperty('--seg-w', `${active.offsetWidth}px`);
    seg.style.setProperty('--seg-x', `${active.offsetLeft - pad}px`);
    seg.classList.add('seg-ready');
  });
}

function wireSeg(seg) {
  if (!seg || seg.__qsWired) return;
  seg.__qsWired = true;
  // measure now and after layout settles (fonts, reflow)
  positionSegPill(seg);
  raf(() => positionSegPill(seg));
  setTimeout(() => positionSegPill(seg), 60);

  // re-measure on any click within the seg (active class flips synchronously,
  // and the app may re-render the panel right after)
  seg.addEventListener('click', () => {
    positionSegPill(seg);
    raf(() => positionSegPill(seg));
  });

  // class flips that aren't click-driven (programmatic) -> attribute observer
  safe(() => {
    const mo = new MutationObserver(() => positionSegPill(seg));
    seg.querySelectorAll('.seg-btn').forEach((b) =>
      mo.observe(b, { attributes: true, attributeFilter: ['class'] }));
    seg.__qsMo = mo;
  });
}

function scanSegs() {
  safe(() => document.querySelectorAll('.seg').forEach(wireSeg));
}

/* re-wire whenever panels re-render (progress segs are recreated each render) */
function observeSegLife() {
  safe(() => {
    const targets = ['#progress-body', '#history-body'].map((s) =>
      document.querySelector(s)).filter(Boolean);
    const mo = new MutationObserver(() => raf(scanSegs));
    targets.forEach((t) => mo.observe(t, { childList: true, subtree: true }));
    // also catch the static history seg + any late mounts
    const head = document.getElementById('pager');
    if (head) mo.observe(head, { childList: true, subtree: true });
  });
}

window.addEventListener('resize', () => raf(scanSegs), { passive: true });

/* ============================================================
   2) PER-PANEL ACTIVE-DAY BACKGROUND HUE
   The faint top wash on each .panel-scroll picks up the actually-
   active day color. Reads the active picker/chip; falls back to the
   per-panel default already set in CSS.
   ============================================================ */
function activeDayColor(panel) {
  // History: focus context day; Progress: active day picker; Log: selected day chip
  const el =
    panel.querySelector('.pd-btn.is-active[style*="--c"]') ||
    panel.querySelector('.day-chip[style*="--c"]') ||
    panel.querySelector('.section-row .rail[style], .focus-context[style*="--c"]');
  if (el) {
    const c = (el.getAttribute('style') || '').match(/--c:\s*([^;]+)/);
    if (c) return c[1].trim();
  }
  return null;
}

function refreshPanelHue() {
  safe(() => {
    document.querySelectorAll('.panel .panel-scroll').forEach((scroll) => {
      const c = activeDayColor(scroll);
      if (c) scroll.style.setProperty('--c', c);
      else scroll.style.removeProperty('--c'); // fall back to CSS default
    });
  });
}

/* ============================================================
   3) COUNT-UP ON THE 4 PROGRESS STAT TILES
   Fires once per (re)render when Progress scrolls into view.
   rAF ease-out-cubic ~700ms. tabular-nums in CSS keeps digits steady.
   ============================================================ */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function countUp(el) {
  if (reduceMotion || el.__qsCounted) return;
  const raw = el.textContent.trim();
  // parse: optional leading +/-, number, optional % suffix
  const m = raw.match(/^([+\-]?)(\d+(?:\.\d+)?)(%?)$/);
  if (!m) return;
  el.__qsCounted = true;
  const sign = m[1], target = parseFloat(m[2]), suffix = m[3];
  const decimals = (m[2].split('.')[1] || '').length;
  const dur = 700, start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const v = (easeOutCubic(t) * target).toFixed(decimals);
    el.textContent = `${sign}${v}${suffix}`;
    if (t < 1) raf(frame);
    else el.textContent = raw; // exact final value
  }
  raf(frame);
}

function runCountUps() {
  safe(() => {
    const tiles = document.querySelectorAll('#panel-progress .stat .s-val');
    tiles.forEach((el) => { el.__qsCounted = false; });
    tiles.forEach(countUp);
  });
}

function observeProgressVisible() {
  safe(() => {
    const panel = document.getElementById('panel-progress');
    if (!panel || !('IntersectionObserver' in window)) { runCountUps(); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) runCountUps(); });
    }, { threshold: 0.4 });
    io.observe(panel);

    // re-run when the stat strip is re-rendered while already visible
    const body = document.getElementById('progress-body');
    if (body) {
      const mo = new MutationObserver(() => {
        if (panel.getBoundingClientRect().left < window.innerWidth * 0.6) raf(runCountUps);
      });
      mo.observe(body, { childList: true, subtree: true });
    }
  });
}

/* ============================================================
   4) SAVE "RING CLOSE" HERO MOMENT
   On tap: button compresses (CSS), a thin conic ring sweeps closed,
   a check scales in, and a single soft glow blooms once. One clean,
   earned, mechanical confirmation. navigator.vibrate gated on support.
   ============================================================ */
const RING_SVG =
  '<svg viewBox="0 0 36 36" aria-hidden="true">' +
  '<circle class="qs-arc" cx="18" cy="18" r="15" pathLength="100" ' +
  'transform="rotate(-90 18 18)"/>' +
  '<path class="qs-check" d="M11 18.5 L16 23 L25 13" pathLength="24"/>' +
  '</svg>';

function dressSaveButton(btn) {
  if (!btn || btn.__qsDressed) return;
  btn.__qsDressed = true;
  safe(() => {
    // wrap so the ring can sit absolutely without disturbing layout
    let host = btn.closest('.save-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'save-host';
      btn.parentNode.insertBefore(host, btn);
      host.appendChild(btn);
    }
    if (!host.querySelector('.save-ring')) {
      const ring = document.createElement('div');
      ring.className = 'save-ring';
      ring.innerHTML = RING_SVG;
      host.appendChild(ring);
    }

    btn.addEventListener('click', () => {
      safe(() => { if (navigator.vibrate) navigator.vibrate(10); });
      if (reduceMotion) {
        // instant opacity check, no sweep
        host.classList.add('is-confirm');
        return;
      }
      // restart the animations cleanly
      host.classList.remove('is-confirm', 'is-bloom');
      // force reflow so re-adding the class replays the keyframes
      void host.offsetWidth;
      host.classList.add('is-confirm', 'is-bloom');
      // the app re-renders Step B right after save; the fresh DOM resets state.
      // clear our flags defensively in case the node survives.
      setTimeout(() => safe(() => host.classList.remove('is-confirm', 'is-bloom')), 900);
    }, true); // capture: fire before the app's handler swaps the view
  });
}

function scanSave() {
  safe(() => {
    const btn = document.getElementById('save');
    if (btn) dressSaveButton(btn);
  });
}

function observeSaveLife() {
  safe(() => {
    const steps = document.getElementById('log-steps');
    if (!steps) return;
    const mo = new MutationObserver(() => raf(scanSave));
    mo.observe(steps, { childList: true, subtree: true });
  });
}

/* ============================================================
   BOOT — defer to next frame; never assume render timing.
   ============================================================ */
let booted = false;
function boot() {
  // idempotent rescans (safe to call repeatedly)
  scanSegs();
  refreshPanelHue();
  scanSave();
  if (booted) return;
  booted = true;

  // one-time observers
  observeSegLife();
  observeProgressVisible();
  observeSaveLife();

  // a global, cheap re-sync on any pager-level mutation keeps segs +
  // background hue honest as panels re-render (debounced via rAF).
  safe(() => {
    const pager = document.getElementById('pager');
    if (!pager) return;
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      raf(() => { queued = false; scanSegs(); refreshPanelHue(); });
    });
    mo.observe(pager, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style'] });
  });

  // also follow horizontal pager scroll for the hue (cheap, passive)
  safe(() => {
    const pager = document.getElementById('pager');
    if (pager) pager.addEventListener('scroll', () => raf(refreshPanelHue), { passive: true });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => raf(boot), { once: true });
} else {
  raf(boot);
}
// app.js mounts panels via modules after this loads; give it a couple beats too.
setTimeout(() => safe(boot), 120);
setTimeout(() => safe(() => { scanSegs(); refreshPanelHue(); runCountUps(); }), 400);

export {};
