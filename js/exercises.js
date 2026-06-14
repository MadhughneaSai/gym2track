// Canonical day + exercise catalog. Order here is the order everywhere.

export const DAYS = [
  { id: 'push', name: 'Push', color: 'var(--push)' },
  { id: 'legs', name: 'Legs', color: 'var(--legs)' },
  { id: 'pull', name: 'Pull', color: 'var(--pull)' },
];

export const EXERCISES = [
  // Push
  { id: 'chest-fly',          day: 'push', name: 'Chest Fly',         short: 'Chest Fly' },
  { id: 'incline-press',      day: 'push', name: 'Incline Press',     short: 'Incline' },
  { id: 'triceps-pushdown',   day: 'push', name: 'Triceps Pushdown',  short: 'Triceps' },
  { id: 'lateral-raise',      day: 'push', name: 'Lateral Raise',     short: 'Lateral' },
  { id: 'shoulder-press',     day: 'push', name: 'Shoulder Press',    short: 'Shoulder' },
  // Legs
  { id: 'leg-extension',      day: 'legs', name: 'Leg Extension',     short: 'Leg Ext' },
  { id: 'hamstring-curl',     day: 'legs', name: 'Hamstring Curl',    short: 'Hams' },
  { id: 'calf-raise',         day: 'legs', name: 'Calf Raise',        short: 'Calves' },
  { id: 'back-extension',     day: 'legs', name: 'Back Extension',    short: 'Low Back' },
  { id: 'ab-crunch',          day: 'legs', name: 'Ab Crunch',         short: 'Abs' },
  // Pull
  { id: 'chest-supported-row', day: 'pull', name: 'Supported Row',    short: 'Row' },
  { id: 'lat-pulldown',       day: 'pull', name: 'Lat Pulldown',      short: 'Lats' },
  { id: 'bicep-curl',         day: 'pull', name: 'Barbell Curl',      short: 'Biceps' },
  // 'forearm-curl' keeps its original id so any already-logged sets stay attached
  { id: 'forearm-curl',       day: 'pull', name: 'Overhand Forearm',  short: 'Overhand' },
  { id: 'forearm-curl-under', day: 'pull', name: 'Underhand Forearm', short: 'Underhand' },
];

export const dayById = Object.fromEntries(DAYS.map(d => [d.id, d]));
export const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
export const exercisesFor = dayId => EXERCISES.filter(e => e.day === dayId);
