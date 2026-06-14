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
  render();
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
    return `<th class="date-h" colspan="2">${fmtDate(dt)}<span class="day-dots">${dots}</span><span class="dow">${fmtDow(dt)}</span></th>`;
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
    </div>`;

  const wrap = body().querySelector('#table-wrap');
  wrap.addEventListener('scroll', () => {
    wrap.classList.toggle('scrolled-x', wrap.scrollLeft > 2);
  }, { passive: true });

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
    <div class="focus-deck" id="focus-deck">${cards}</div>`;

  const deck = body().querySelector('#focus-deck');
  const ctx = body().querySelector('#focus-context');

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

