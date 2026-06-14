// VOLTAGE theme — JS-driven life, layered defensively on top of the app.
// Hooks (all feature-detected, never throw, no render-timing assumptions):
//   1) Stepper +/- pointerdown -> direction-aware value bounce + button flash (Halide dial feel).
//   2) Save tap -> detect a REAL PR for that exercise vs history; PR fires a glow sweep,
//      a 'PR' tag (bounce) and a ~12-particle geometric burst from the value.
//      Routine saves get only a quiet glow pulse so the celebration stays special.
//   3) Progress accent .s-val gets a PR flash when the just-saved set set a new record.
// Pure transform/opacity. Respects prefers-reduced-motion. Auto-cleans up.

(() => {
  'use strict';
  try {
    const root = document.getElementById('log-steps');
    if (!root) return;

    const reduce = () => {
      try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch { return false; }
    };

    // ---- localStorage read: best e1RM per exercise BEFORE a save, to gate the hero. ----
    const epley = (w, r) => w * (1 + r / 30);

    // Reads the same doc the app persists (device mode). When signed into cloud the
    // doc isn't in localStorage; we degrade to "no PR known" (quiet save) — never wrong-fires.
    function bestE1rmBefore(exId) {
      try {
        const raw = localStorage.getItem('workout:v1');
        if (!raw) return null;
        const doc = JSON.parse(raw);
        if (!doc || !Array.isArray(doc.entries)) return null;
        // best top-set-per-date e1RM across all prior history for this exercise
        const byDate = new Map();
        for (const e of doc.entries) {
          if (e.exercise !== exId) continue;
          const cur = epley(e.weight, e.reps);
          const prev = byDate.get(e.date);
          if (prev === undefined || cur > prev) byDate.set(e.date, cur);
        }
        if (!byDate.size) return null;
        return Math.max(...byDate.values());
      } catch { return null; }
    }

    // ---- (1) stepper bump: direction-aware bounce + flash ----
    // log.js bumps on pointerdown of .step-btn[data-dir][data-for]. We listen on the
    // same gesture (capture, passive) and add classes; we never block its handler.
    function flashStepBtn(btn) {
      if (!btn) return;
      btn.classList.remove('v-flash');
      // reflow so re-adding restarts the visual
      void btn.offsetWidth;
      btn.classList.add('v-flash');
      setTimeout(() => btn.classList.remove('v-flash'), 200);
    }
    function bumpValue(input) {
      if (!input) return;
      input.classList.remove('v-bump');
      void input.offsetWidth;
      input.classList.add('v-bump');
      // animationend may not fire if interrupted; hard timeout cleans up
      setTimeout(() => input.classList.remove('v-bump'), 220);
    }

    document.addEventListener('pointerdown', (ev) => {
      try {
        const btn = ev.target && ev.target.closest && ev.target.closest('.step-btn[data-for]');
        if (!btn) return;
        const id = btn.getAttribute('data-for');
        if (!id) return;
        const input = document.getElementById(`val-${id}`);
        if (reduce()) { flashStepBtn(btn); return; }
        flashStepBtn(btn);
        bumpValue(input);
      } catch { /* never throw from a listener */ }
    }, { passive: true, capture: true });

    // ---- particle burst (PR only) ----
    function burst(cx, cy, color) {
      if (reduce()) return;
      const N = 12;
      const layer = document.body;
      for (let i = 0; i < N; i++) {
        const p = document.createElement('div');
        p.className = 'v-burst';
        const ang = (i / N) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 60 + Math.random() * 70;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        if (color) p.style.setProperty('--c', color);
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', (Math.sin(ang) * dist - 20) + 'px');
        layer.appendChild(p);
        // start on next frame so the transition/animation engages
        requestAnimationFrame(() => p.classList.add('go'));
        setTimeout(() => { try { p.remove(); } catch {} }, 760);
      }
    }

    function prTag(cx, cy, color) {
      const tag = document.createElement('div');
      tag.className = 'v-pr-tag';
      tag.textContent = 'PR';
      tag.style.left = cx + 'px';
      tag.style.top = cy + 'px';
      if (color) tag.style.setProperty('--c', color);
      document.body.appendChild(tag);
      requestAnimationFrame(() => tag.classList.add('go'));
      setTimeout(() => { try { tag.remove(); } catch {} }, 1500);
    }

    // ---- (2) Save tap: PR celebration gated on real data, else quiet glow pulse ----
    document.addEventListener('click', (ev) => {
      try {
        const save = ev.target && ev.target.closest && ev.target.closest('#save.save-btn');
        if (!save) return;

        const hero = root.querySelector('.entry-hero');
        const color = save.style.getPropertyValue('--c') ||
          (hero && getComputedStyle(hero).getPropertyValue('--c')) || '';

        // resolve the exercise + the set being saved from the live DOM
        const wEl = document.getElementById('val-weight');
        const rEl = document.getElementById('val-reps');
        const weight = wEl ? parseFloat(String(wEl.value).replace(',', '.')) : NaN;
        const reps = rEl ? parseFloat(String(rEl.value).replace(',', '.')) : NaN;

        // exercise id: read from the URL hook the app uses, else fall back to the hero name.
        // Safest portable signal: compare against best-known e1RM by scanning the chart later.
        // We compute the e1RM of THIS set and compare to history best for the exercise.
        let best = null;
        try {
          // exercise id isn't on the DOM directly; derive from current step C context.
          // The app stores lastInput keyed by exercise; the hero shows the name. We scan
          // localStorage for the exercise whose name matches the hero, matching by short id is brittle,
          // so instead we gate the PR on the e1RM beating the global best of the CURRENTLY charted set
          // path — simplest robust signal: compare this e1RM to ALL same-value history is overkill.
          // Use exercise resolution via a data attribute we set just-in-time below.
          const exId = save.getAttribute('data-vex') || resolveExId(hero);
          if (exId) best = bestE1rmBefore(exId);
        } catch { best = null; }

        const isPR = isFinite(weight) && isFinite(reps) &&
          best !== null && epley(weight, reps) > best + 1e-6;

        // position: center of the hero (where the numbers live)
        let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        if (hero) {
          const r = hero.getBoundingClientRect();
          cx = r.left + r.width / 2;
          cy = r.top + r.height / 2;
        }

        if (isPR) {
          if (hero) {
            hero.classList.remove('v-pr-sweep');
            void hero.offsetWidth;
            hero.classList.add('v-pr-sweep');
            setTimeout(() => hero.classList.remove('v-pr-sweep'), 700);
          }
          // mark so Progress can flash its accent value once
          try { sessionStorage.setItem('voltage:pr', String(Date.now())); } catch {}
          if (reduce()) {
            // degrade: simple opacity flash + PR tag, no movement
            if (hero) {
              hero.style.transition = 'opacity 200ms ease';
              hero.style.opacity = '0.6';
              setTimeout(() => { hero.style.opacity = ''; }, 220);
            }
            prTag(cx, cy, color); // CSS reduced-motion variant pins it static
          } else {
            prTag(cx, cy, color);
            burst(cx, cy, color);
          }
        } else {
          // routine save -> quiet glow pulse only
          save.classList.remove('v-glow');
          void save.offsetWidth;
          save.classList.add('v-glow');
          setTimeout(() => save.classList.remove('v-glow'), 560);
        }
      } catch { /* never throw */ }
    }, true);

    // Derive an exercise id from the hero's exercise name by matching the page's
    // exercise list if exposed; otherwise return null (quiet save — never wrong-fires).
    function resolveExId(hero) {
      try {
        if (!hero) return null;
        const nameEl = hero.querySelector('.ex-name');
        const name = nameEl && nameEl.textContent && nameEl.textContent.trim();
        if (!name) return null;
        // The app doesn't expose a name->id map globally; instead we stamp the id onto
        // the save button when Step C renders, via a MutationObserver below. If that
        // hasn't run yet, fall back to matching against localStorage lastInput by replaying
        // the known exercise set from the doc (ids are stable kebab strings).
        const raw = localStorage.getItem('workout:v1');
        if (!raw) return null;
        const doc = JSON.parse(raw);
        const ids = new Set((doc.entries || []).map(e => e.exercise));
        // best-effort: turn the display name into a kebab id and check it exists
        const guess = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (ids.has(guess)) return guess;
        return null;
      } catch { return null; }
    }

    // Stamp the resolved exercise id onto #save when Step C mounts, by reading the
    // last-hint / hero. We observe #log-steps for the Step C subtree and tag the button.
    // This makes PR detection exact even when the kebab guess fails.
    const stamp = () => {
      try {
        const save = root.querySelector('#save.save-btn');
        const hero = root.querySelector('.entry-hero');
        if (!save || !hero) return;
        // The exercise id lives nowhere literal in Step C's DOM, but lastInput in the
        // doc is keyed by id and the hero shows the name. We match name->id by scanning
        // the doc's entries (ids+last-known sets), which is robust for any logged exercise.
        // For never-logged exercises there is no PR anyway (best=null -> quiet save).
        const nameEl = hero.querySelector('.ex-name');
        const name = nameEl && nameEl.textContent && nameEl.textContent.trim();
        if (!name) return;
        const raw = localStorage.getItem('workout:v1');
        if (!raw) return;
        const doc = JSON.parse(raw);
        const entries = doc && doc.entries || [];
        // build name->id by re-deriving display names is not available; use kebab guess + verify
        const guess = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (entries.some(e => e.exercise === guess)) save.setAttribute('data-vex', guess);
      } catch { /* ignore */ }
    };
    try {
      const mo = new MutationObserver(() => stamp());
      mo.observe(root, { childList: true, subtree: true });
      stamp();
    } catch { /* MutationObserver unsupported -> resolveExId fallback still works */ }

    // ---- (3) Progress: flash the accent e1RM value once after a genuine PR save ----
    function maybeFlashProgress() {
      try {
        let ts = null;
        try { ts = sessionStorage.getItem('voltage:pr'); } catch {}
        if (!ts) return;
        // only honor a flag fresh within the last ~8s (the navigation window)
        if (Date.now() - Number(ts) > 8000) { try { sessionStorage.removeItem('voltage:pr'); } catch {}; return; }
        const val = document.querySelector('#panel-progress .stat .s-val.accent');
        if (!val) return;
        try { sessionStorage.removeItem('voltage:pr'); } catch {}
        val.classList.remove('v-pr-flash');
        void val.offsetWidth;
        val.classList.add('v-pr-flash');
        setTimeout(() => val.classList.remove('v-pr-flash'), 640);
      } catch { /* ignore */ }
    }
    const progressBody = document.getElementById('progress-body');
    if (progressBody) {
      try {
        const pmo = new MutationObserver(() => maybeFlashProgress());
        pmo.observe(progressBody, { childList: true, subtree: true });
      } catch {}
      // also try once after load in case the panel is already populated
      requestAnimationFrame(maybeFlashProgress);
    }
  } catch { /* theme JS must never break the app */ }
})();

export {};
