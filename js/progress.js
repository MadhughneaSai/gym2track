// Panel 3 — Progress: exercise picker + e1RM charts (Strength / Detail) with touch scrub.

import { DAYS, dayById, exercisesFor, exById } from './exercises.js';
import { pict } from './icons.js';
import { onChange, prefs, setPref, seriesFor, fmtDate, fmtDow, parseKey } from './state.js';
import { goToPanel } from './app.js';

const body = () => document.getElementById('progress-body');
let sel; // {day, exercise, mode, range}
let resizeObs = null;
let scrubIndex = null;

export function initProgress() {
  sel = { ...prefs().progress };
  if (!exById[sel.exercise]) sel = { day: 'push', exercise: 'chest-fly', mode: 'strength', range: 'all' };
  onChange(() => { scrubIndex = null; render(); });
  window.addEventListener('resize', scheduleRedraw);
  render();
}

function persist() {
  setPref('progress.day', sel.day);
  setPref('progress.exercise', sel.exercise);
  setPref('progress.mode', sel.mode);
  setPref('progress.range', sel.range);
}

/* ============ data ============ */
function filteredSeries() {
  const all = seriesFor(sel.exercise);
  // PR flags are computed against ALL history, then the window is applied
  let runMax = -Infinity;
  all.forEach((p, i) => {
    p.pr = i > 0 && p.e1rm > runMax;
    runMax = Math.max(runMax, p.e1rm);
  });
  if (sel.range === 'all') return all;
  const days = sel.range === '3m' ? 90 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return all.filter(p => parseKey(p.date) >= cutoff);
}

/* ============ render ============ */
function render() {
  const d = dayById[sel.day];
  const ex = exById[sel.exercise];
  const pts = filteredSeries();
  const fullCount = seriesFor(sel.exercise).length; // controls stay visible even when the window is empty

  const dayBtns = DAYS.map(x =>
    `<button class="pd-btn${x.id === sel.day ? ' is-active' : ''}" data-day="${x.id}" style="--c:${x.color}">${x.name}</button>`).join('');

  const exChips = exercisesFor(sel.day).map(e =>
    `<button class="pe-chip${e.id === sel.exercise ? ' is-active' : ''}" data-ex="${e.id}" style="--c:${d.color}">${pict(e.id)}${e.short}</button>`).join('');

  const first = pts[0], lastP = pts[pts.length - 1];
  const best = pts.length ? Math.max(...pts.map(p => p.e1rm)) : 0;
  const delta = pts.length > 1 ? ((lastP.e1rm - first.e1rm) / first.e1rm) * 100 : 0;

  const stats = pts.length ? `
    <div class="stat-strip">
      <div class="stat"><div class="s-val accent num" style="--c:${d.color}">${Math.round(lastP.e1rm)}</div><div class="s-lbl">e1RM now</div></div>
      <div class="stat"><div class="s-val num">${Math.round(best)}</div><div class="s-lbl">Best</div></div>
      <div class="stat"><div class="s-val num">${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%</div><div class="s-lbl">Since first</div></div>
      <div class="stat"><div class="s-val num">${pts.length}</div><div class="s-lbl">Sessions</div></div>
    </div>` : '';

  const controls = fullCount > 1 ? `
    <div class="chart-controls">
      <div class="seg" id="mode-seg">
        <button class="seg-btn${sel.mode === 'strength' ? ' is-active' : ''}" data-mode="strength">Strength</button>
        <button class="seg-btn${sel.mode === 'detail' ? ' is-active' : ''}" data-mode="detail">Detail</button>
      </div>
      <div class="seg" id="range-seg">
        <button class="seg-btn${sel.range === 'all' ? ' is-active' : ''}" data-range="all">All</button>
        <button class="seg-btn${sel.range === '3m' ? ' is-active' : ''}" data-range="3m">3M</button>
        <button class="seg-btn${sel.range === '1m' ? ' is-active' : ''}" data-range="1m">1M</button>
      </div>
    </div>` : '';

  let chart;
  if (!pts.length && !fullCount) {
    chart = `
      <div class="empty" style="--c:${d.color}">
        ${pict(sel.exercise)}
        <div class="e-title">No sets logged yet</div>
        <div class="e-sub">Log ${ex.name} a couple of times and your strength curve appears here.</div>
        <button class="e-btn" id="empty-go">Log a set</button>
      </div>`;
  } else if (!pts.length) {
    chart = `
      <div class="empty" style="--c:${d.color}">
        <div class="e-title">Nothing in this window</div>
        <div class="e-sub">No ${ex.name} sessions in the selected range — try All.</div>
      </div>`;
  } else if (pts.length === 1) {
    chart = `
      <div class="empty" style="--c:${d.color}">
        <div class="e-title num">${lastP.weight} lb × ${lastP.reps}</div>
        <div class="e-sub">First benchmark set (${fmtDate(lastP.date)}) — e1RM <b>${Math.round(lastP.e1rm)} lb</b>.
        One more session draws the line.</div>
      </div>`;
  } else {
    const legend = sel.mode === 'detail' ? `
      <div class="chart-legend">
        <span class="lg"><i style="background:var(--text)"></i>e1RM</span>
        <span class="lg"><i style="background:var(--text-3)"></i>Weight</span>
        <span class="lg"><i style="background:var(--text);height:8px"></i>Reps</span>
      </div>` : '';
    chart = `
      <div class="chart-card" style="--c:${d.color}">
        <div class="chart-readout num" id="readout"></div>
        <div class="chart-svg-wrap" id="chart-wrap"></div>
        ${legend}
      </div>`;
  }

  body().innerHTML = `
    <div class="picker-days">${dayBtns}</div>
    <div class="picker-ex">${exChips}</div>
    ${stats}${controls}${chart}`;

  bind(pts, d);
}

function bind(pts, d) {
  body().querySelectorAll('.pd-btn').forEach(b => b.addEventListener('click', () => {
    sel.day = b.dataset.day;
    sel.exercise = exercisesFor(sel.day)[0].id;
    scrubIndex = null; persist(); render();
  }));
  body().querySelectorAll('.pe-chip').forEach(b => b.addEventListener('click', () => {
    sel.exercise = b.dataset.ex;
    scrubIndex = null; persist(); render();
  }));
  body().querySelector('#mode-seg')?.querySelectorAll('.seg-btn').forEach(b =>
    b.addEventListener('click', () => { sel.mode = b.dataset.mode; persist(); render(); }));
  body().querySelector('#range-seg')?.querySelectorAll('.seg-btn').forEach(b =>
    b.addEventListener('click', () => { sel.range = b.dataset.range; scrubIndex = null; persist(); render(); }));
  body().querySelector('#empty-go')?.addEventListener('click', () => goToPanel(0));

  const wrap = body().querySelector('#chart-wrap');
  if (wrap) {
    drawChart(wrap, pts, d, true); // animate on (re)render
    resizeObs?.disconnect();
    resizeObs = new ResizeObserver(scheduleRedraw);
    resizeObs.observe(wrap);
  }
}

let redrawQueued = false;
let lastChartW = 0;
function scheduleRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    const wrap = body().querySelector('#chart-wrap');
    // skip the ResizeObserver's initial fire (same width) so it can't cut off the draw-on
    if (wrap && wrap.clientWidth !== lastChartW) drawChart(wrap, filteredSeries(), dayById[sel.day], false);
  });
}

/* ============ chart ============ */
function drawChart(wrap, pts, d, animate = false) {
  const W = Math.max(280, wrap.clientWidth);
  const isDesktop = W > 700;
  const H = isDesktop ? 380 : 300;
  const detail = sel.mode === 'detail';
  const padL = 38, padR = 30, padT = 16;
  const barBand = detail ? 44 : 0;       // reps bars live here in Detail
  const padB = 24 + barBand;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // y-scale over the lb series shown
  const ys = detail ? pts.flatMap(p => [p.e1rm, p.weight]) : pts.map(p => p.e1rm);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  const span = Math.max(yMax - yMin, 10);
  yMin = Math.max(0, yMin - span * 0.12);
  yMax = yMax + span * 0.12;
  const step = niceStep((yMax - yMin) / 4);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  const X = i => pts.length === 1 ? padL + plotW / 2 : padL + (i / (pts.length - 1)) * plotW;
  const Y = v => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  lastChartW = W;

  let g = '';

  // gridlines + y labels (theme-driven via CSS classes)
  for (let v = yMin; v <= yMax + 0.01; v += step) {
    const y = Y(v);
    g += `<line class="grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke-width="1"/>`;
    g += `<text class="axis-label" x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9">${Math.round(v)}</text>`;
  }

  // x labels, thinned
  const every = Math.max(1, Math.ceil(pts.length / Math.floor(plotW / 56)));
  pts.forEach((p, i) => {
    if (i % every === 0 || i === pts.length - 1) {
      g += `<text class="axis-label" x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="9">${fmtDate(p.date)}</text>`;
    }
  });

  // reps bars (Detail) — thin ink verticals, like the reference
  if (detail) {
    const maxReps = Math.max(...pts.map(p => p.reps));
    const bandTop = H - 24 - barBand + 6;
    pts.forEach((p, i) => {
      const h = (p.reps / maxReps) * (barBand - 10);
      const y = bandTop + (barBand - 10) - h;
      g += `<rect class="bar" x="${X(i) - 1.25}" y="${y}" width="2.5" height="${h}" style="animation-delay:${i * 26}ms"/>`;
    });
  }

  const e1 = pts.map((p, i) => [X(i), Y(p.e1rm)]);

  // soft area under the e1RM line (Strength only)
  if (!detail) {
    g += `<path class="area fade" d="${monotonePath(e1)} L ${e1[e1.length - 1][0]} ${padT + plotH} L ${e1[0][0]} ${padT + plotH} Z"/>`;
  }

  // weight line (Detail) — same lb axis; the gap to the e1RM line IS the reps contribution
  if (detail) {
    const wl = pts.map((p, i) => [X(i), Y(p.weight)]);
    g += `<path class="ln-weight fade" d="${monotonePath(wl)}"/>`;
    wl.forEach(([x, y]) => { g += `<circle class="dot-weight fade" cx="${x}" cy="${y}" r="2.5"/>`; });
  }

  // e1RM line — solid ink, draws on
  g += `<path class="ln" pathLength="1" d="${monotonePath(e1)}"/>`;
  const lastIdx = pts.length - 1;
  pts.forEach((p, i) => {
    const [x, y] = e1[i];
    g += `<circle class="dot fade" cx="${x}" cy="${y}" r="${i === lastIdx ? 4 : 3}" stroke="var(--bg)" stroke-width="2"/>`;
    if (p.pr && i !== lastIdx) g += `<text class="fade pr-star" x="${x}" y="${y - 9}" text-anchor="middle" font-size="11">★</text>`;
  });

  // floating most-recent e1RM value at the end (the end point IS "now"; star crowns a PR)
  if (pts.length >= 2) {
    const [lx, ly] = e1[lastIdx];
    const val = Math.round(pts[lastIdx].e1rm);
    const lblY = Math.min(padT + plotH - 4, Math.max(padT + 14, ly - 12));
    if (pts[lastIdx].pr) {
      const numW = String(val).length * 10;
      g += `<text class="fade pr-star" x="${lx - numW - 11}" y="${lblY}" text-anchor="middle" font-size="13">★</text>`;
    }
    g += `<text class="now-val fade" x="${lx}" y="${lblY}" text-anchor="end" font-size="17" font-variant-numeric="tabular-nums">${val}</text>`;
  }

  // scrub crosshair
  const si = scrubIndex !== null && scrubIndex < pts.length ? scrubIndex : pts.length - 1;
  const [sx] = e1[si];
  g += `<line class="scrub" x1="${sx}" y1="${padT}" x2="${sx}" y2="${padT + plotH}" stroke-width="1" stroke-dasharray="2 4" opacity="0.8"/>`;
  g += `<circle class="scrub-dot" cx="${sx}" cy="${e1[si][1]}" r="6" stroke-width="1.5" opacity="0.9"/>`;

  wrap.innerHTML = `<svg class="chart-svg${animate ? ' is-anim' : ''}" viewBox="0 0 ${W} ${H}" font-family="inherit">${g}</svg>`;
  updateReadout(pts, si);

  // scrub interaction (pointer events; touch-action:none on wrap)
  wrap.onpointerdown = wrap.onpointermove = ev => {
    if (ev.type === 'pointermove' && ev.buttons === 0 && ev.pointerType !== 'mouse') return;
    const rect = wrap.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    let bi = 0, bd = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(X(i) - px);
      if (dist < bd) { bd = dist; bi = i; }
    });
    if (bi !== scrubIndex) {
      scrubIndex = bi;
      drawChart(wrap, pts, d);
    }
  };
}

function updateReadout(pts, i) {
  const ro = body().querySelector('#readout');
  if (!ro) return;
  const p = pts[i];
  const approx = p.reps > 15 ? '~' : '';
  ro.innerHTML = `${fmtDow(p.date)} ${fmtDate(p.date)} · <b>${p.weight} lb × ${p.reps}</b> · e1RM <span class="ro-score">${approx}${Math.round(p.e1rm)}</span>`;
}

/* ============ helpers ============ */
function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

// Monotone cubic (Fritsch–Carlson) — never overshoots between points
function monotonePath(P) {
  const n = P.length;
  if (n === 1) return `M ${P[0][0]} ${P[0][1]}`;
  if (n === 2) return `M ${P[0][0]} ${P[0][1]} L ${P[1][0]} ${P[1][1]}`;
  const dx = [], dy = [], s = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(P[i + 1][0] - P[i][0]);
    dy.push(P[i + 1][1] - P[i][1]);
    s.push(dy[i] / dx[i]);
  }
  const m = [s[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2);
  }
  m.push(s[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / s[i], b = m[i + 1] / s[i];
    const h = Math.hypot(a, b);
    if (h > 3) { m[i] = 3 * s[i] * a / h; m[i + 1] = 3 * s[i] * b / h; }
  }
  let path = `M ${P[0][0]} ${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = P[i][0] + dx[i] / 3, c1y = P[i][1] + m[i] * dx[i] / 3;
    const c2x = P[i + 1][0] - dx[i] / 3, c2y = P[i + 1][1] - m[i + 1] * dx[i] / 3;
    path += ` C ${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(P[i + 1][0])} ${r2(P[i + 1][1])}`;
  }
  return path;
}
const r2 = v => Math.round(v * 100) / 100;
