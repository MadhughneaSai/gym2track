// Panel 1 — Log: day -> exercise -> weight/reps, three tap-driven steps.

import { DAYS, dayById, exercisesFor, exById } from './exercises.js';
import { pict, GLYPHS } from './icons.js';
import { addEntry, lastInputFor, lastLogged, topSet, todayKey, fmtLong, fmtDate, fmtDow } from './state.js';
import { toast, openSheet, closeSheet } from './app.js';

const root = () => document.getElementById('log-steps');

let day = null;       // selected day id
let exercise = null;  // selected exercise id
let logDate = todayKey(); // which date sets are logged to (defaults to today; backdating supported)

const keyForDaysAgo = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateLabel = key =>
  key === keyForDaysAgo(0) ? 'Today'
  : key === keyForDaysAgo(1) ? 'Yesterday'
  : `${fmtDow(key)}, ${fmtDate(key)}`;

export function initLog() {
  document.getElementById('log-today').textContent = fmtLong(todayKey());
  renderDayStep();
}

// Jump straight to Step C for an exercise (used by History's "Log this exercise now")
export function openEntryFor(exId) {
  exercise = exId;
  day = exById[exId].day;
  renderEntryStep();
}

// Jump to Step B for a day (dev previews)
export function openDay(dayId) {
  day = dayId;
  renderExStep();
}

function mount(html, back = false) {
  const r = root();
  r.innerHTML = `<div class="log-step${back ? ' is-back' : ''}">${html}</div>`;
  return r.firstElementChild;
}

// ---- Step A: pick day ----
function renderDayStep(back = false) {
  day = null; exercise = null;
  logDate = todayKey();   // starting a fresh log flow always defaults to today (safety)
  const cards = DAYS.map(d => {
    const exs = exercisesFor(d.id);
    const minis = exs.slice(0, 3).map(e => pict(e.id)).join('');
    return `
      <button class="day-card" data-day="${d.id}" style="--c:${d.color}">
        <div>
          <div class="day-name">${d.name}</div>
          <div class="day-meta">${exs.length} exercises</div>
        </div>
        <div class="day-minis">${minis}</div>
      </button>`;
  }).join('');

  const el = mount(`<div class="step-label">Which day is it?</div>${cards}`, back);
  el.querySelectorAll('.day-card').forEach(btn =>
    btn.addEventListener('click', () => { day = btn.dataset.day; renderExStep(); }));
}

// ---- Step B: pick exercise ----
function renderExStep(back = false) {
  exercise = null;
  const d = dayById[day];
  const today = todayKey();
  const cards = exercisesFor(day).map(e => {
    const done = topSet(today, e.id);
    return `
      <button class="ex-card" data-ex="${e.id}" style="--c:${d.color}">
        ${done ? `<span class="ex-done">${GLYPHS.check}</span>` : ''}
        ${pict(e.id)}
        <span class="ex-name">${e.name}</span>
        <span class="ex-sub">${done ? `${done.weight} lb × ${done.reps}` : ''}</span>
      </button>`;
  }).join('');

  const el = mount(`
    <div class="step-head" style="--c:${d.color}">
      <button class="back-btn" id="step-back">${GLYPHS.back}</button>
      <span class="day-chip">${d.name}</span>
    </div>
    <div class="ex-grid">${cards}</div>`, back);

  el.querySelector('#step-back').addEventListener('click', () => renderDayStep(true));
  el.querySelectorAll('.ex-card').forEach(btn =>
    btn.addEventListener('click', () => { exercise = btn.dataset.ex; renderEntryStep(); }));
}

// ---- Step C: weight & reps ----
function renderEntryStep() {
  const e = exById[exercise];
  const d = dayById[e.day];
  const prefill = lastInputFor(exercise) || { weight: 50, reps: 10 };
  const last = lastLogged(exercise);

  const el = mount(`
    <div class="step-head" style="--c:${d.color}">
      <button class="back-btn" id="step-back">${GLYPHS.back}</button>
      <span class="day-chip">${d.name}</span>
      <button class="log-date-chip${logDate !== todayKey() ? ' backdated' : ''}" id="log-date" style="--c:${d.color}">
        ${GLYPHS.calendar}<span id="log-date-label">${dateLabel(logDate)}</span>
      </button>
    </div>
    <div class="entry-hero" style="--c:${d.color}">
      ${pict(exercise)}
      <div>
        <div class="ex-name">${e.name}</div>
      </div>
    </div>
    ${stepperHTML('weight', 'Weight', 'lb', prefill.weight, d.color)}
    ${stepperHTML('reps', 'Reps', '', prefill.reps, d.color)}
    <div class="last-hint">${last ? `Last: ${last.weight} lb × ${last.reps} · ${fmtDate(last.date)}` : 'First time — set your baseline'}</div>
    <button class="save-btn" id="save" style="--c:${d.color}">Save set</button>`);

  el.querySelector('#step-back').addEventListener('click', () => renderExStep(true));
  el.querySelector('#log-date').addEventListener('click', () => openDateSheet(el));
  bindStepper(el, 'weight', 5, 0);
  bindStepper(el, 'reps', 1, 1);

  el.querySelector('#save').addEventListener('click', () => {
    const weight = readValue(el, 'weight', 0);
    const reps = readValue(el, 'reps', 1);
    addEntry({ exercise, weight, reps, date: logDate });
    const when = logDate === todayKey() ? '' : ` · ${dateLabel(logDate)}`;
    toast(`Logged ${e.name} — ${weight} lb × ${reps}${when}`);
    renderExStep(true);
  });
}

// date picker sheet: quick shortcuts + a native date input (capped at today)
function openDateSheet(stepEl) {
  const quick = [['Today', 0], ['Yesterday', 1], ['2 days ago', 2], ['3 days ago', 3]]
    .map(([label, n]) => [label, keyForDaysAgo(n)]);
  const sheet = openSheet(`
    <h3>Workout date</h3>
    <div class="sheet-sub">When did you do this? Backdated sets drop into the right day automatically.</div>
    <div class="date-quick">
      ${quick.map(([label, key]) => `<button class="date-quick-btn${key === logDate ? ' is-active' : ''}" data-key="${key}">${label}</button>`).join('')}
    </div>
    <label class="date-pick">
      <span>Pick a date</span>
      <input type="date" id="date-input" max="${keyForDaysAgo(0)}" value="${logDate}">
    </label>`);

  const apply = key => {
    logDate = key;
    const chip = stepEl.querySelector('#log-date');
    chip.classList.toggle('backdated', key !== todayKey());
    stepEl.querySelector('#log-date-label').textContent = dateLabel(key);
    closeSheet();
  };
  sheet.querySelectorAll('.date-quick-btn').forEach(b => b.addEventListener('click', () => apply(b.dataset.key)));
  sheet.querySelector('#date-input').addEventListener('change', ev => { if (ev.target.value) apply(ev.target.value); });
}

function stepperHTML(id, label, unit, value, color) {
  return `
    <div class="stepper" style="--c:${color}">
      <div class="stepper-label"><span>${label}</span>${unit ? `<span>${unit}</span>` : ''}</div>
      <div class="stepper-row">
        <button class="step-btn num" data-dir="-1" data-for="${id}">−</button>
        <input class="stepper-value num" id="val-${id}" type="text" inputmode="decimal" value="${value}" autocomplete="off">
        <button class="step-btn num" data-dir="1" data-for="${id}">+</button>
      </div>
    </div>`;
}

function readValue(el, id, min) {
  const input = el.querySelector(`#val-${id}`);
  let v = parseFloat(String(input.value).replace(',', '.'));
  if (!isFinite(v) || v < min) v = min;
  v = Math.round(v * 4) / 4; // allow 2.5 / 0.25 typed increments, kill float noise
  input.value = v;
  return v;
}

function bindStepper(el, id, step, min) {
  const input = el.querySelector(`#val-${id}`);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('blur', () => readValue(el, id, min));
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') input.blur(); });

  el.querySelectorAll(`.step-btn[data-for="${id}"]`).forEach(btn => {
    const dir = +btn.dataset.dir;
    let holdT = null, repeatT = null;
    const bump = mult => {
      const cur = readValue(el, id, min);
      input.value = Math.max(min, cur + dir * step * mult);
    };
    btn.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      bump(1);
      let ticks = 0;
      holdT = setTimeout(() => {
        repeatT = setInterval(() => bump(++ticks > 8 ? 2 : 1), 110);
      }, 450);
    });
    const stop = () => { clearTimeout(holdT); clearInterval(repeatT); };
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('click', ev => ev.preventDefault()); // pointerdown already bumped
  });
}
