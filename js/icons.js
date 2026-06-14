// Hand-drawn line-art pictograms, 48x48, stroke = currentColor (tints with day color).

const P = inner =>
  `<svg viewBox="0 0 48 48" class="pict" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const dot = (x, y, r = 1.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

export const PICTOGRAMS = {
  // ---- PUSH ----
  // Pec deck: seated figure squeezing two side pads inward
  'chest-fly': P(`
    <circle cx="24" cy="8" r="3.5"/>
    <path d="M24 12v16"/>
    <path d="M17 32h14M24 32v8"/>
    <path d="M24 15l-8 4M24 15l8 4"/>
    <path d="M13 11v17M35 11v17"/>
  `),
  // Incline dumbbell press: diagonal bench, pressing up-forward
  'incline-press': P(`
    <path d="M9 40L29 24"/>
    <path d="M15 36v6M25 29v13"/>
    <circle cx="32" cy="20" r="3.5"/>
    <path d="M29 25l7-9"/>
    <path d="M31 11l9 7"/>
    ${dot(30, 10.2)}${dot(41, 18.8)}
  `),
  // Cable triceps pushdown: cable from top, bar pushed to waist
  'triceps-pushdown': P(`
    <circle cx="18" cy="9" r="3.5"/>
    <path d="M18 13v16M18 29l-4 12M18 29l5 12"/>
    <path d="M18 16l7 5 2 8"/>
    <path d="M20 30h13"/>
    <path d="M29 4v26"/>
  `),
  // Cable lateral raise: arm out to the side, cable to low pulley
  'lateral-raise': P(`
    <circle cx="19" cy="9" r="3.5"/>
    <path d="M19 13v17M19 30l-4 12M19 30l5 12"/>
    <path d="M19 16l-7 8"/>
    <path d="M19 16l15-3"/>
    <path d="M34 13l7 27"/>
    ${dot(41, 42, 2)}
  `),
  // Seated dumbbell shoulder press: arms in a V, dumbbells overhead
  'shoulder-press': P(`
    <circle cx="24" cy="13" r="3.5"/>
    <path d="M24 17v14"/>
    <path d="M17 35h14M24 35v6"/>
    <path d="M24 19l-8-8M24 19l8-8"/>
    <path d="M12 9h8M28 9h8"/>
    <path d="M12 6.5v5M20 6.5v5M28 6.5v5M36 6.5v5"/>
  `),

  // ---- LEGS ----
  // Leg extension: seated, shins raising the pad
  'leg-extension': P(`
    <circle cx="17" cy="10" r="3.5"/>
    <path d="M17 14l-2 14"/>
    <path d="M13 12l-3 16"/>
    <path d="M15 28h12"/>
    <path d="M27 28l10-6"/>
    <path d="M34 18l4 8"/>
    <path d="M19 28v12M13 40h12"/>
  `),
  // Lying hamstring curl: prone on bench, heels curling up
  'hamstring-curl': P(`
    <path d="M8 31h26M12 31v8M30 31v8"/>
    <circle cx="11" cy="25" r="3"/>
    <path d="M14 28h19"/>
    <path d="M33 28l5-10"/>
    <path d="M34 15l8 4"/>
  `),
  // Standing calf raise: shoulder pads, heels off the block
  'calf-raise': P(`
    <circle cx="24" cy="8" r="3.5"/>
    <path d="M15 14h18"/>
    <path d="M24 12v15"/>
    <path d="M24 27l-4 10M24 27l4 10"/>
    <path d="M20 37l-3 4M28 37l-3 4"/>
    <path d="M14 43h20"/>
  `),
  // 45° back extension: hinging the torso up
  'back-extension': P(`
    <path d="M9 41L25 26"/>
    <path d="M15 41v-5M9 43h20"/>
    <path d="M14 38l10-10"/>
    <path d="M24 27l11-9"/>
    <circle cx="38" cy="15" r="3"/>
  `),
  // Seated ab crunch machine: curling forward to handles
  'ab-crunch': P(`
    <circle cx="17" cy="15" r="3.5"/>
    <path d="M19 18c3 3 3 8 1 12"/>
    <path d="M20 21l7-3"/>
    <path d="M28 13v8"/>
    <path d="M14 31h14M30 31l2-12"/>
    <path d="M20 31l-4 10M20 31l3 10"/>
  `),

  // ---- PULL ----
  // Chest-supported incline row: prone on pad, barbell hanging below
  'chest-supported-row': P(`
    <path d="M13 36L30 21"/>
    <path d="M19 41v-6M10 42h22"/>
    <circle cx="33" cy="17" r="3"/>
    <path d="M25 26v7"/>
    <path d="M17 35h18"/>
    ${dot(17, 35, 2.4)}${dot(35, 35, 2.4)}
  `),
  // Lat pulldown: curved wide bar overhead, arms spread wide, seated
  'lat-pulldown': P(`
    <path d="M8 9q16 5 32 0"/>
    <path d="M24 4v7"/>
    <circle cx="24" cy="20" r="3.5"/>
    <path d="M24 24v10"/>
    <path d="M24 26L11 11M24 26l13-15"/>
    <path d="M17 38h14M24 38v5"/>
  `),
  // Standing barbell curl: elbows in, bar curled to mid
  'bicep-curl': P(`
    <circle cx="24" cy="8" r="3.5"/>
    <path d="M24 12v16M24 28l-4 12M24 28l4 12"/>
    <path d="M24 15l-6 8M24 15l6 8"/>
    <path d="M18 23l-3-4M30 23l3-4"/>
    <path d="M11 19h26"/>
    <path d="M11 16v6M37 16v6"/>
  `),
  // Overhand wrist curl: forearm flat on bench, knuckles up, lifting from above
  'forearm-curl': P(`
    <path d="M8 29h22M13 29v11M25 29v11"/>
    <path d="M13 26l15-2"/>
    ${dot(13, 26, 2)}
    <path d="M28 24l5-6"/>
    <path d="M29 14l9 7"/>
    ${dot(28, 13.2)}${dot(39, 21.8)}
  `),
  // Underhand wrist curl: forearm flat on bench, palm up, bar curling from below
  'forearm-curl-under': P(`
    <path d="M8 29h22M13 29v11M25 29v11"/>
    <path d="M13 26l15-2"/>
    ${dot(13, 26, 2)}
    <path d="M28 24l6 3"/>
    <path d="M38 22l-7 9"/>
    ${dot(39, 23)}${dot(30, 32)}
  `),
};

// Small UI glyphs (24x24)
const G = (inner, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const GLYPHS = {
  back: G(`<path d="M14.5 5l-7 7 7 7"/>`),
  check: G(`<path d="M4.5 12.5l5 5L19.5 7"/>`),
  trash: G(`<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5"/>`),
  calendar: G(`<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>`),
  gear: G(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`),
};

export const pict = id => PICTOGRAMS[id] || '';
