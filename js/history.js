// Panel 2 — History: Grid (full table) + Focus (per-date deck) + entry/data sheets.

import { DAYS, dayById, exercisesFor, exById } from './exercises.js';
import { pict, GLYPHS } from './icons.js';
import {
  onChange, prefs, setPref, activeDates, dayTypesOf, topSet, entriesFor, prevTopSet,
  deleteEntry, fmtDate, fmtDow, fmtLong, todayKey,
} from './state.js';
import { openSheet, closeSheet, toast, goToPanel } from './app.js';
import { openEntryFor } from './log.js';

const body = () => document.getElementById('history-body');
let view = 'grid';
let syncNav = null;   // recompute the active view's scroll-arrow state on window resize

export function initHistory() {
  view = prefs().historyView || 'grid';
  const seg = document.getElementById('history-seg');
  seg.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.view === view);
    b.addEventListener('click', () => {
      view = b.dataset.view;
      setPref('historyView', view);
      seg.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('is-active', x === b));
      render();
    });
  });
  onChange(render);
  // keep the desktop scroll arrows accurate when the window resizes
  window.addEventListener('resize', () => syncNav && syncNav(), { passive: true });
  render();
}

/* ============ desktop horizontal-scroll arrows ============ */
// Touch users swipe; on a mouse/trackpad there's no easy way to scroll a wide table
// sideways, so we add left/right arrows below the content. CSS hides them on touch.
function scrollNavHTML() {
  return `
    <div class="hscroll-nav" role="group" aria-label="Scroll sideways">
      <button class="hscroll-btn" type="button" data-dir="-1" aria-label="Scroll left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <button class="hscroll-btn" type="button" data-dir="1" aria-label="Scroll right">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>`;
}

// ctrl = { target(dir) → desired scrollLeft, atStart(), atEnd() } — lets each view
// define its own step (one day in Focus, one week in Grid) and its own end-detection.
function wireScrollNav(scrollEl, navEl, ctrl) {
  if (!scrollEl || !navEl) return;
  const btnL = navEl.querySelector('[data-dir="-1"]');
  const btnR = navEl.querySelector('[data-dir="1"]');
  const maxScroll = () => scrollEl.scrollWidth - scrollEl.clientWidth;
  navEl.querySelectorAll('.hscroll-btn').forEach(b =>
    b.addEventListener('click', () => {
      const t = Math.max(0, Math.min(maxScroll(), Math.round(ctrl.target(+b.dataset.dir))));
      scrollEl.scrollTo({ left: t, behavior: 'smooth' });
    }));
  syncNav = () => {
    navEl.classList.toggle('is-hidden', maxScroll() <= 2);   // nothing to scroll → hide entirely
    btnL.disabled = ctrl.atStart();
    btnR.disabled = ctrl.atEnd();
  };
  scrollEl.addEventListener('scroll', () => requestAnimationFrame(syncNav), { passive: true });
  requestAnimationFrame(syncNav);
}

// Focus: advance exactly one day-card per click, centered (matches the scroll-snap rest points).
function focusDayCtrl(deck) {
  const cards = () => [...deck.children];
  const maxS = () => deck.scrollWidth - deck.clientWidth;
  const centered = () => {
    const cs = cards(); if (!cs.length) return 0;
    const mid = deck.scrollLeft + deck.clientWidth / 2;
    let idx = 0, best = Infinity;
    cs.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < best) { best = d; idx = i; } });
    return idx;
  };
  return {
    target: (dir) => {
      const cs = cards(); if (!cs.length) return deck.scrollLeft;
      const c = cs[Math.max(0, Math.min(cs.length - 1, centered() + dir))];
      return c.offsetLeft + c.offsetWidth / 2 - deck.clientWidth / 2;   // centre that card
    },
    // edge cards can't be centred (not enough scroll room), so the scroll extremes
    // also count as the ends — otherwise the last/first card never disables its arrow.
    atStart: () => deck.scrollLeft <= 2 || centered() <= 0,
    atEnd: () => deck.scrollLeft >= maxS() - 2 || centered() >= cards().length - 1,
  };
}

// Grid: advance ~one week of workout-date columns per click, snapped to a column edge.
function gridWeekCtrl(wrap) {
  const WEEK = 7 * 24 * 3600 * 1000;
  const heads = [...wrap.querySelectorAll('th.date-h')];   // left→right = newest→oldest
  const rail = wrap.querySelector('.corner');
  const railW = () => (rail ? rail.offsetWidth : 0);
  const leftOf = h => h.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft;
  const dms = s => Date.parse(s + 'T00:00:00');
  const anchorIdx = () => {                                 // leftmost date column past the sticky rail
    const edge = wrap.scrollLeft + railW() + 2;
    for (let i = 0; i < heads.length; i++) if (leftOf(heads[i]) + heads[i].offsetWidth > edge) return i;
    return Math.max(0, heads.length - 1);
  };
  return {
    target: (dir) => {
      if (!heads.length) return wrap.scrollLeft + dir * wrap.clientWidth * 0.8;
      const a = anchorIdx(), aDate = dms(heads[a].dataset.date);
      if (dir > 0) {                                        // older — first column ≥ a week back
        for (let i = a + 1; i < heads.length; i++) if (aDate - dms(heads[i].dataset.date) >= WEEK) return leftOf(heads[i]) - railW();
        return Infinity;                                    // within a week of the end → go all the way
      }
      for (let i = a - 1; i >= 0; i--) if (dms(heads[i].dataset.date) - aDate >= WEEK) return leftOf(heads[i]) - railW();
      return 0;                                             // within a week of the start
    },
    atStart: () => wrap.scrollLeft <= 2,
    atEnd: () => wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 2,
  };
}

function render() {
  const dates = activeDates().slice().reverse(); // newest first
  if (!dates.length) {
    body().innerHTML = `
      <div class="empty">
        ${pict('shoulder-press')}
        <div class="e-title">No workouts yet</div>
        <div class="e-sub">Log your first set and it shows up here, newest day first.</div>
        <button class="e-btn" id="empty-go">Log a set</button>
      </div>`;
    body().querySelector('#empty-go').addEventListener('click', () => goToPanel(0));
    return;
  }
  if (view === 'grid') renderGrid(dates);
  else renderFocus(dates);
}

/* ============ GRID ============ */
function renderGrid(dates) {
  const dateHead = dates.map(dt => {
    const dots = dayTypesOf(dt).map(d => `<i style="background:${dayById[d].color}"></i>`).join('');
    return `<th class="date-h" colspan="2" data-date="${dt}">${fmtDate(dt)}<span class="day-dots">${dots}</span><span class="dow">${fmtDow(dt)}</span></th>`;
  }).join('');
  const subHead = dates.map(() => `<th class="sub-h">lb</th><th class="sub-h">reps</th>`).join('');

  const rows = DAYS.map(d => {
    const section = `
      <tr class="section-row" style="--c:${d.color}">
        <th class="rail">${d.name}</th>
        ${dates.map(() => `<td colspan="2"></td>`).join('')}
      </tr>`;
    const exRows = exercisesFor(d.id).map(e => {
      const cells = dates.map(dt => {
        const s = topSet(dt, e.id);
        if (!s) return `<td class="cell">·</td><td class="cell">·</td>`;
        return `<td class="cell filled w num" data-date="${dt}" data-ex="${e.id}">${s.weight}</td>` +
               `<td class="cell filled num" data-date="${dt}" data-ex="${e.id}">${s.reps}</td>`;
      }).join('');
      return `<tr style="--c:${d.color}"><th class="rail">${e.name}</th>${cells}</tr>`;
    }).join('');
    return section + exRows;
  }).join('');

  body().innerHTML = `
    <div class="table-wrap" id="table-wrap">
      <table class="htable">
        <thead>
          <tr><th class="corner">Exercise</th>${dateHead}</tr>
          <tr><th class="corner"></th>${subHead}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${scrollNavHTML()}`;

  const wrap = body().querySelector('#table-wrap');
  wrap.addEventListener('scroll', () => {
    wrap.classList.toggle('scrolled-x', wrap.scrollLeft > 2);
  }, { passive: true });
  wireScrollNav(wrap, body().querySelector('.hscroll-nav'), gridWeekCtrl(wrap));

  wrap.querySelector('tbody').addEventListener('click', ev => {
    const cell = ev.target.closest('td.filled');
    if (cell) openCellSheet(cell.dataset.date, cell.dataset.ex);
  });
}

/* ============ FOCUS ============ */
function renderFocus(dates) {
  const cards = dates.map(dt => {
    const types = dayTypesOf(dt);
    const primary = dayById[types[0]];
    const sections = types.map(t => exercisesFor(t).map(e => {
      const s = topSet(dt, e.id);
      if (!s) return '';
      return `
        <div class="fcard-row" data-date="${dt}" data-ex="${e.id}" style="--c:${dayById[t].color}">
          ${pict(e.id)}
          <span class="fr-name">${e.name}</span>
          <span class="fr-set num">${s.weight}<span class="u"> lb</span><span class="x">×</span>${s.reps}</span>
          ${deltaChip(e.id, dt, s)}
        </div>`;
    }).join('')).join('');

    return `
      <article class="focus-card" data-date="${dt}" data-days="${types.join(',')}" style="--c:${primary.color}">
        <div class="fcard-head">
          <div>
            <div class="fcard-date">${fmtDate(dt)}${dt === todayKey() ? ' · Today' : ''}</div>
            <div class="fcard-dow">${fmtDow(dt)}</div>
          </div>
          <span class="day-chip" style="--c:${primary.color}">${types.map(t => dayById[t].name).join(' + ')}</span>
        </div>
        ${sections}
      </article>`;
  }).join('');

  body().innerHTML = `
    <div class="focus-context" id="focus-context"><span class="fc-day"></span><span class="fc-date"></span></div>
    <div class="focus-deck" id="focus-deck">${cards}</div>
    ${scrollNavHTML()}`;

  const deck = body().querySelector('#focus-deck');
  const ctx = body().querySelector('#focus-context');
  wireScrollNav(deck, body().querySelector('.hscroll-nav'), focusDayCtrl(deck));

  const syncContext = () => {
    const mid = deck.scrollLeft + deck.clientWidth / 2;
    let best = null, bestDist = Infinity;
    for (const card of deck.children) {
      const center = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) { bestDist = dist; best = card; }
    }
    if (!best) return;
    const types = best.dataset.days.split(',');
    const d = dayById[types[0]];
    ctx.style.setProperty('--c', d.color);
    ctx.querySelector('.fc-day').textContent = types.map(t => dayById[t].name).join(' + ');
    ctx.querySelector('.fc-date').textContent = `${fmtDow(best.dataset.date)} ${fmtDate(best.dataset.date)}`;
  };

  let tick = false;
  deck.addEventListener('scroll', () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => { tick = false; syncContext(); });
  }, { passive: true });
  syncContext();

  deck.addEventListener('click', ev => {
    const row = ev.target.closest('.fcard-row');
    if (row) openCellSheet(row.dataset.date, row.dataset.ex);
  });
}

function deltaChip(exId, date, s) {
  const prev = prevTopSet(exId, date);
  if (!prev) return `<span class="delta same">new</span>`;
  const dw = s.weight - prev.weight;
  if (dw !== 0) {
    const up = dw > 0;
    return `<span class="delta ${up ? 'up' : 'down'} num">${up ? '▲' : '▼'} ${Math.abs(dw)} lb</span>`;
  }
  const dr = s.reps - prev.reps;
  if (dr !== 0) {
    const up = dr > 0;
    return `<span class="delta ${up ? 'up' : 'down'} num">${up ? '▲' : '▼'} ${Math.abs(dr)} rep${Math.abs(dr) > 1 ? 's' : ''}</span>`;
  }
  return `<span class="delta same">— same</span>`;
}

/* ============ CELL SHEET (raw entries + delete) ============ */
function openCellSheet(date, exId) {
  const e = exById[exId];
  const d = dayById[e.day];
  const list = entriesFor(date, exId);
  if (!list.length) return;

  const rows = list.map(en => {
    const t = new Date(en.t);
    const hh = t.getHours() % 12 || 12, mm = String(t.getMinutes()).padStart(2, '0');
    return `
      <div class="entry-row">
        <span class="er-set num">${en.weight} lb <span class="x">×</span> ${en.reps}</span>
        <span class="er-time">${hh}:${mm} ${t.getHours() >= 12 ? 'PM' : 'AM'}</span>
        <button class="er-del" data-id="${en.id}" aria-label="Delete entry">${GLYPHS.trash}</button>
      </div>`;
  }).join('');

  const el = openSheet(`
    <h3>${e.name}</h3>
    <div class="sheet-sub" style="--c:${d.color}">${fmtLong(date)} · ${d.name} day</div>
    ${rows}
    <button class="sheet-action" id="log-again" style="--c:${d.color}">Log this exercise now</button>`);

  el.querySelectorAll('.er-del').forEach(btn =>
    btn.addEventListener('click', () => {
      deleteEntry(btn.dataset.id);
      toast('Entry deleted');
      closeSheet();
    }));
  el.querySelector('#log-again').addEventListener('click', () => {
    closeSheet();
    openEntryFor(exId);
    goToPanel(0);
  });
}

