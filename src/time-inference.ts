// Resolves a bare clock time or range (no am/pm) using "most recent past" inference,
// with an optional date-word override. Returns null when there is no bare numeric time
// to resolve, so the caller can fall back to chrono-node.

export interface InferredTime {
  start: Date;
  end: Date | null; // null = single time (caller supplies a duration); Date = range
  remove: Array<[number, number]>; // [index, length] spans to delete from the input for the title
}

// Meridiem attached to a digit: "2pm", "2 pm", "9-10:30am", "2 p.m.".
// "exam"/"spam" are NOT matched (the a/p is not preceded by a digit).
const MERIDIEM_RE = /\d\s*[ap]\.?m\b/i;

// date word -> day offset; tonight also forces PM.
const DATE_WORDS: Record<string, { offset: number; forcePm?: boolean }> = {
  today: { offset: 0 },
  tomorrow: { offset: 1 },
  yesterday: { offset: -1 },
  tonight: { offset: 0, forcePm: true },
};
const DATE_WORD_RE = /\b(today|tomorrow|yesterday|tonight)\b/i;

// H[:MM] (sep) H[:MM], sep = - | – | "to". Matched anywhere.
const RANGE_RE = /\b(\d{1,2})(?::([0-5]\d))?\s*(?:-|–|to)\s*(\d{1,2})(?::([0-5]\d))?\b/;
// Trailing H[:MM] — only at the end, so an earlier title number isn't grabbed.
const SINGLE_RE = /\b(\d{1,2})(?::([0-5]\d))?\s*$/;

const validHour = (h: number) => h >= 0 && h <= 23;

// A Date at `dayOffset` days from base.date, set to hour:minute local.
function atTime(base: Date, hour: number, minute: number, dayOffset: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Most-recent-past start. For ambiguous 1-12, the latest of {today,yesterday}x{am,pm}
// that is <= now. For 0/13-23 (24h) the clock time today, rolled back a day if future.
function resolveStart(hour: number, minute: number, now: Date): Date {
  if (hour === 0 || hour >= 13) {
    let d = atTime(now, hour, minute, 0);
    if (d > now) d = atTime(now, hour, minute, -1);
    return d;
  }
  const candidates: Date[] = [];
  for (const off of [0, -1]) {
    candidates.push(atTime(now, hour % 12, minute, off)); // am (12 -> 0)
    candidates.push(atTime(now, (hour % 12) + 12, minute, off)); // pm (12 -> 12)
  }
  return candidates
    .filter((d) => d <= now)
    .sort((a, b) => b.getTime() - a.getTime())[0]; // yesterday-am is always past, so non-empty
}

// First occurrence of the end clock time strictly after start.
function resolveEnd(hour: number, minute: number, start: Date): Date {
  if (hour === 0 || hour >= 13) {
    let d = atTime(start, hour, minute, 0);
    if (d <= start) d = atTime(start, hour, minute, 1);
    return d;
  }
  const opts: Date[] = [];
  for (const off of [0, 1]) {
    opts.push(atTime(start, hour % 12, minute, off));
    opts.push(atTime(start, (hour % 12) + 12, minute, off));
  }
  return opts
    .filter((d) => d > start)
    .sort((a, b) => a.getTime() - b.getTime())[0]; // next-day pm is always after, so non-empty
}

// Resolve start, then if a date word is present move it to that date (keeping the
// inferred hour:minute), forcing PM for "tonight".
function resolveStartWithWord(
  hour: number,
  minute: number,
  word: string | undefined,
  now: Date,
): Date {
  const base = resolveStart(hour, minute, now);
  if (!word) return base;
  const { offset, forcePm } = DATE_WORDS[word];
  let h = base.getHours();
  if (forcePm && h < 12) h += 12;
  return atTime(now, h, base.getMinutes(), offset);
}

export function inferTime(text: string, now: Date): InferredTime | null {
  if (MERIDIEM_RE.test(text)) return null; // explicit am/pm -> let chrono handle it

  const wm = text.match(DATE_WORD_RE);
  const word = wm ? wm[1].toLowerCase() : undefined;
  const wordSpan: Array<[number, number]> = wm ? [[wm.index!, wm[0].length]] : [];

  const rm = text.match(RANGE_RE);
  if (rm) {
    const sH = +rm[1];
    const sM = rm[2] ? +rm[2] : 0;
    const eH = +rm[3];
    const eM = rm[4] ? +rm[4] : 0;
    if (!validHour(sH) || !validHour(eH)) return null;
    const start = resolveStartWithWord(sH, sM, word, now);
    const end = resolveEnd(eH, eM, start);
    return { start, end, remove: [[rm.index!, rm[0].length], ...wordSpan] };
  }

  const sm = text.match(SINGLE_RE);
  if (sm) {
    const sH = +sm[1];
    const sM = sm[2] ? +sm[2] : 0;
    if (!validHour(sH)) return null;
    const start = resolveStartWithWord(sH, sM, word, now);
    return { start, end: null, remove: [[sm.index!, sm[0].length], ...wordSpan] };
  }

  return null;
}
