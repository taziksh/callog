# Meridiem Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the parser accept bare 12-hour times, 24-hour times, and date words, inferring the meridiem by "most recent past."

**Architecture:** A new `src/time-inference.ts` module resolves bare/24h numeric times (a pure function over text + `now`). `src/parser.ts` calls it *before* chrono-node, but only when no `am`/`pm` is present; everything chrono already handles is left untouched.

**Tech Stack:** TypeScript on Bun. Tests via `bun test`. Time math uses local-time `Date` methods (`getHours`/`setHours`) so behavior matches the user's system zone, consistent with the rest of the app.

**Spec:** `docs/superpowers/specs/2026-05-22-meridiem-inference-design.md`

---

## File Structure

- **Create** `src/time-inference.ts` — pure resolver: `inferTime(text, now) → InferredTime | null`. Owns regex matching, most-recent-past selection, range-end selection, and date-word override. No chrono, no I/O.
- **Create** `src/time-inference.test.ts` — unit tests for the resolver, with a fixed local-time `now`.
- **Modify** `src/parser.ts` — call `inferTime` between duration extraction and the chrono call; assemble title by stripping the matched spans. Existing chrono path unchanged.
- **Modify** `src/parser.test.ts` — add a `describe('meridiem inference')` block exercising the parser end-to-end.
- **Modify** `README.md` — document bare/24h times, most-recent-past, date words.
- **Modify** `src/cli.ts` — mirror the same in the `--help` text.

---

## Task 1: The `time-inference` resolver

**Files:**
- Create: `src/time-inference.ts`
- Test: `src/time-inference.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/time-inference.test.ts` with exactly this content:

```ts
import { describe, test, expect } from 'bun:test';
import { inferTime } from './time-inference.js';

// Local-time builder so assertions are timezone-independent: both `now` and the
// expected results are constructed with the same local Date constructor.
// May 15 2026 is a Friday; May 14 is Thursday.
const at = (d: number, h: number, mi = 0) => new Date(2026, 4, d, h, mi, 0);
const now = at(15, 15); // Fri 3:00 PM local

describe('returns null (defer to chrono)', () => {
  test('explicit pm present', () => expect(inferTime('leetcode 2-4pm', now)).toBeNull());
  test('explicit am present', () => expect(inferTime('deep work 9-10:30am', now)).toBeNull());
  test('no numeric time at all', () => expect(inferTime('no time here', now)).toBeNull());
  test('"am" inside a word is not a meridiem', () => expect(inferTime('exam 2-4', now)).not.toBeNull());
  test('range hour out of 0-23 range', () => expect(inferTime('dp 1-50', now)).toBeNull());
});

describe('bare ranges — most recent past', () => {
  test('2-4 at 3pm -> 2-4 PM', () => {
    const r = inferTime('leetcode 2-4', now)!;
    expect(r.start).toEqual(at(15, 14));
    expect(r.end).toEqual(at(15, 16));
  });
  test('9-11 at 3pm -> 9-11 AM', () => {
    const r = inferTime('deep work 9-11', now)!;
    expect(r.start).toEqual(at(15, 9));
    expect(r.end).toEqual(at(15, 11));
  });
  test('11-1 crosses noon -> 11 AM - 1 PM', () => {
    const r = inferTime('sync 11-1', now)!;
    expect(r.start).toEqual(at(15, 11));
    expect(r.end).toEqual(at(15, 13));
  });
  test('minutes preserved: 9-10:30', () => {
    const r = inferTime('x 9-10:30', now)!;
    expect(r.start).toEqual(at(15, 9));
    expect(r.end).toEqual(at(15, 10, 30));
  });
  test('2:00-4:00 no longer AM-defaults', () => {
    const r = inferTime('x 2:00-4:00', now)!;
    expect(r.start).toEqual(at(15, 14));
    expect(r.end).toEqual(at(15, 16));
  });
});

describe('boundary cases', () => {
  test('lunch 2-3 at 1pm -> 2-3 AM', () => {
    const r = inferTime('lunch 2-3', at(15, 13))!;
    expect(r.start).toEqual(at(15, 2));
    expect(r.end).toEqual(at(15, 3));
  });
  test('2-4 at 1am -> yesterday 2-4 PM', () => {
    const r = inferTime('x 2-4', at(15, 1))!;
    expect(r.start).toEqual(at(14, 14));
    expect(r.end).toEqual(at(14, 16));
  });
});

describe('24-hour', () => {
  test('14-16 -> 2-4 PM', () => {
    const r = inferTime('block 14-16', now)!;
    expect(r.start).toEqual(at(15, 14));
    expect(r.end).toEqual(at(15, 16));
  });
  test('mixed 9-17 -> 9 AM - 5 PM', () => {
    const r = inferTime('block 9-17', now)!;
    expect(r.start).toEqual(at(15, 9));
    expect(r.end).toEqual(at(15, 17));
  });
});

describe('trailing single time (for start+duration)', () => {
  test('trailing 2 -> 2 PM, end null', () => {
    const r = inferTime('lap 2', now)!;
    expect(r.start).toEqual(at(15, 14));
    expect(r.end).toBeNull();
  });
  test('picks trailing number, not an earlier title number', () => {
    const r = inferTime('do 3 problems 2', now)!;
    expect(r.start).toEqual(at(15, 14));
    // the removed span is the trailing "2", leaving "do 3 problems"
    const removed = r.remove.map(([i, len]) => 'do 3 problems 2'.slice(i, i + len));
    expect(removed).toContain('2');
  });
});

describe('date words override the date', () => {
  test('tomorrow 9-10 -> tomorrow 9-10 AM', () => {
    const r = inferTime('meeting tomorrow 9-10', now)!;
    expect(r.start).toEqual(at(16, 9));
    expect(r.end).toEqual(at(16, 10));
  });
  test('yesterday 2-4 -> yesterday 2-4 PM', () => {
    const r = inferTime('review yesterday 2-4', now)!;
    expect(r.start).toEqual(at(14, 14));
    expect(r.end).toEqual(at(14, 16));
  });
  test('tonight 8-9 -> today 8-9 PM (forced pm)', () => {
    const r = inferTime('tonight 8-9', now)!;
    expect(r.start).toEqual(at(15, 20));
    expect(r.end).toEqual(at(15, 21));
  });
  test('date word span is reported for removal', () => {
    const r = inferTime('meeting tomorrow 9-10', now)!;
    const removed = r.remove.map(([i, len]) => 'meeting tomorrow 9-10'.slice(i, i + len));
    expect(removed).toContain('tomorrow');
    expect(removed).toContain('9-10');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/time-inference.test.ts`
Expected: FAIL — `Cannot find module './time-inference.js'` (module not created yet).

- [ ] **Step 3: Implement the resolver**

Create `src/time-inference.ts` with exactly this content:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/time-inference.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/time-inference.ts src/time-inference.test.ts
git commit -m "Add time-inference resolver for bare/24h times

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire inference into the parser

**Files:**
- Modify: `src/parser.ts`
- Test: `src/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block to the end of `src/parser.test.ts` (before the final newline). It uses a local-time `now`, distinct from the file's existing `now`, because meridiem assertions are local-time sensitive:

```ts
describe('meridiem inference', () => {
  // Local-time builder so AM/PM assertions don't depend on host timezone.
  const at = (d: number, h: number, mi = 0) => new Date(2026, 4, d, h, mi, 0);
  const pm3 = at(15, 15); // Fri 3:00 PM

  const okAt = (input: string, n: Date): ParsedEvent => {
    const r = parse(input, n);
    if ('error' in r) throw new Error(`expected ok, got error "${r.error}" (input: ${JSON.stringify(input)})`);
    return r;
  };

  test('bare pm range', () => {
    const e = okAt('leetcode 2-4', pm3);
    expect(e.title).toBe('leetcode');
    expect(e.start).toEqual(at(15, 14));
    expect(e.end).toEqual(at(15, 16));
  });
  test('bare am range', () => {
    expect(okAt('deep work 9-11', pm3).start).toEqual(at(15, 9));
  });
  test('crosses noon: 11-1', () => {
    const e = okAt('sync 11-1', pm3);
    expect(e.start).toEqual(at(15, 11));
    expect(e.end).toEqual(at(15, 13));
  });
  test('boundary: lunch 2-3 at 1pm -> AM', () => {
    expect(okAt('lunch 2-3', at(15, 13)).start).toEqual(at(15, 2));
  });
  test('boundary: 2-4 at 1am -> yesterday PM', () => {
    expect(okAt('x 2-4', at(15, 1)).start).toEqual(at(14, 14));
  });
  test('24-hour range', () => {
    expect(okAt('block 14-16', pm3).start).toEqual(at(15, 14));
  });
  test('mixed 24-hour end', () => {
    const e = okAt('block 9-17', pm3);
    expect(e.start).toEqual(at(15, 9));
    expect(e.end).toEqual(at(15, 17));
  });
  test('2:00-4:00 no longer AM-defaults', () => {
    expect(okAt('x 2:00-4:00', pm3).start).toEqual(at(15, 14));
  });
  test('bare single + duration', () => {
    const e = okAt('lap 2 45min', pm3);
    expect(e.title).toBe('lap');
    expect(e.start).toEqual(at(15, 14));
    expect(mins(e)).toBe(45);
  });
  test('trailing single beats an earlier title number', () => {
    const e = okAt('do 3 problems 2 45min', pm3);
    expect(e.title).toBe('do 3 problems');
    expect(e.start).toEqual(at(15, 14));
  });
  test('date word: tomorrow', () => {
    const e = okAt('meeting tomorrow 9-10', pm3);
    expect(e.title).toBe('meeting');
    expect(e.start).toEqual(at(16, 9));
    expect(e.end).toEqual(at(16, 10));
  });
  test('date word: yesterday', () => {
    expect(okAt('review yesterday 2-4', pm3).start).toEqual(at(14, 14));
  });
  test('date word: tonight forces pm', () => {
    expect(okAt('tonight 8-9', pm3).start).toEqual(at(15, 20));
  });
  test('description still split off', () => {
    const e = okAt('leetcode 2-4 // solved DP', pm3);
    expect(e.title).toBe('leetcode');
    expect(e.description).toBe('solved DP');
  });
  test('bare range + duration is rejected (both)', () => {
    const r = parse('leetcode 2-4 1h', pm3);
    expect('error' in r && r.error).toMatch(/either/);
  });
  test('bare single with no duration is rejected (neither)', () => {
    const r = parse('meeting 2', pm3);
    expect('error' in r && r.error).toMatch(/range|duration/);
  });

  // Pinned known limitation: a number immediately before the time is ambiguous
  // even to a human; document that the trailing single wins.
  test('KNOWN LIMITATION: "do 5 2 30min" treats 2 as the time, "do 5" as title', () => {
    const e = okAt('do 5 2 30min', pm3);
    expect(e.title).toBe('do 5');
    expect(e.start).toEqual(at(15, 14));
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `bun test src/parser.test.ts`
Expected: FAIL in the `meridiem inference` block — bare inputs currently return `no time found` (inference not wired in yet). The other describe blocks still pass.

- [ ] **Step 3: Wire `inferTime` into `parser.ts`**

In `src/parser.ts`, add the import at the top, just under the chrono import:

```ts
import * as chrono from 'chrono-node';
import { inferTime } from './time-inference.js';
```

Add this helper just above the `parse` function (after the `DURATION_RE` constant):

```ts
// Remove the given [index, length] spans from text and collapse whitespace.
function removeSpans(text: string, spans: Array<[number, number]>): string {
  let out = text;
  for (const [i, len] of [...spans].sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, i) + ' ' + out.slice(i + len);
  }
  return out.replace(/\s+/g, ' ').trim();
}
```

Then, in `parse`, insert the inference branch **between** the duration-extraction block (ends at the line `  }` closing `if (durMatch)`) and the comment `// 2. Parse remaining text for time references`. Insert exactly:

```ts
  // 1b. Bare-time inference: no am/pm present -> resolve the meridiem ourselves
  // (most recent past), including 24-hour times and date words. chrono can't do this.
  const inferred = inferTime(working, now);
  if (inferred) {
    const hasRange = inferred.end !== null;
    const hasDuration = durationMinutes !== null;
    if (hasRange && hasDuration) {
      return { error: 'specify either a range OR a start+duration, not both' };
    }
    if (!hasRange && !hasDuration) {
      return { error: 'need either a range (e.g. 2-4pm) or a duration (e.g. 2pm 45min)' };
    }
    const start = inferred.start;
    const end = hasRange
      ? inferred.end!
      : new Date(start.getTime() + durationMinutes! * 60 * 1000);
    if (end <= start) {
      return { error: 'end time is not after start time' };
    }
    const title = removeSpans(working, inferred.remove);
    if (!title) return { error: 'no title found' };
    return { title, start, end, description };
  }

```

The existing `// 2. Parse remaining text...` chrono block stays exactly as-is below this; it now runs only when `inferTime` returned null (i.e. an `am`/`pm` is present, or no bare time matched).

- [ ] **Step 4: Run the full parser test file to verify it passes**

Run: `bun test src/parser.test.ts`
Expected: PASS — the new `meridiem inference` block passes and every pre-existing test still passes (chrono path unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts src/parser.test.ts
git commit -m "Wire bare-time inference into the parser

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Update the docs (README + CLI help)

**Files:**
- Modify: `README.md`
- Modify: `src/cli.ts`

- [ ] **Step 1: Update the README "Time" section**

In `README.md`, replace this block (currently lines ~19-24):

```markdown
### Time — use exactly one form
- **Range:** `2-4pm`, `9-10:30am`, `3-3:30pm`
- **Start + duration:** `2pm 45min`, `6am 1h`, `8pm 90m`, `7am 1.5h`

Duration units: `m` / `min` / `mins` / `minute` / `minutes`, and `h` / `hr` / `hrs` / `hour` / `hours`.
Supplying **both** a range and a duration, or **neither**, is rejected.
```

with:

```markdown
### Time — use exactly one form
- **Range:** `2-4pm`, `9-10:30am`, `3-3:30pm`
- **Start + duration:** `2pm 45min`, `6am 1h`, `8pm 90m`, `7am 1.5h`

Duration units: `m` / `min` / `mins` / `minute` / `minutes`, and `h` / `hr` / `hrs` / `hour` / `hours`.
Supplying **both** a range and a duration, or **neither**, is rejected.

**am/pm is optional.** A bare time is read as the **most recent past** time — the
latest reading at or before now. At 3pm, `2-4` means 2–4pm and `9-11` means 9–11am.
If both readings are still ahead (e.g. it's 1am), it rolls back to yesterday.
**24-hour** times work too: `14-16` is 2–4pm.

A **date word** sets the day: `meeting tomorrow 9-10`, `review yesterday 2-4`,
`tonight 8-9` (`tonight` is pm). The am/pm is still inferred.
```

- [ ] **Step 2: Add bare-time rows to the README examples table**

In `README.md`, in the `### Examples` table, add these two rows immediately after the `reading 8pm 90m` row:

```markdown
| `leetcode 2-4` (at 3pm) | leetcode | 2:00–4:00pm | — |
| `meeting tomorrow 9-10` | meeting | tomorrow 9:00–10:00am | — |
```

- [ ] **Step 3: Update the CLI `--help` text**

In `src/cli.ts`, replace the `<time>` argument block in the `HELP` string (currently lines ~17-20):

```ts
  <time>    one of:
              <start>-<end>      2-4pm        9-10:30am
              <start> <length>   2pm 45min    6am 1h
            length units: m/min, h/hr
```

with:

```ts
  <time>    am/pm optional — a bare time is the most recent past
            (at 3pm, 2-4 = 2-4pm; 9-11 = 9-11am). 24-hour ok: 14-16.
            one of:
              <start>-<end>      2-4pm   9-10:30am   2-4   14-16
              <start> <length>   2pm 45min   6am 1h   2 45min
            length units: m/min, h/hr
            a date word sets the day: tomorrow 9-10   tonight 8-9
```

- [ ] **Step 4: Verify the help text renders and the build is clean**

Run: `bun run src/cli.ts --help`
Expected: prints the help with the new `<time>` block; no TypeScript/runtime errors.

- [ ] **Step 5: Commit**

```bash
git add README.md src/cli.ts
git commit -m "Document bare/24h times and date words in README and --help

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `bun test`
Expected: PASS — all suites green (`time-inference.test.ts`, `parser.test.ts`), including every pre-existing test.

- [ ] **Step 2: Smoke-test a few bare inputs against the parser**

Run:

```bash
bun -e 'import {parse} from "./src/parser.ts"; const now=new Date(2026,4,15,15); for (const s of ["leetcode 2-4","deep work 9-11","block 14-16","tonight 8-9","lap 2 45min"]) { const r=parse(s,now); console.log(s, "->", "error" in r ? r.error : r.title+" "+r.start.toLocaleString()+" -> "+r.end.toLocaleString()); }'
```

Expected: each line shows a resolved title + start/end (no errors); `2-4`→2-4pm, `9-11`→9-11am, `14-16`→2-4pm, `tonight 8-9`→8-9pm, `lap 2 45min`→2:00-2:45pm.

---

## Self-Review

**Spec coverage:**
- Numeric pre-resolver + chrono fallback → Task 2 Step 3 (branch runs only when `inferTime` non-null; chrono block unchanged). ✓
- Trigger guard (no am/pm) → `MERIDIEM_RE` in Task 1. ✓
- Range / trailing-single matching → `RANGE_RE` / `SINGLE_RE`. ✓
- Most-recent-past start (incl. yesterday fallback) → `resolveStart`. ✓
- First-occurrence-after end → `resolveEnd`. ✓
- 24-hour hours → `validHour` + the `hour===0 || hour>=13` branches. ✓
- Date words (today/tomorrow/yesterday/tonight forces pm) → `resolveStartWithWord` + `DATE_WORDS`. ✓
- Start+duration integration & one-of-{range,duration} validation → Task 2 Step 3. ✓
- Worked-examples table → covered across Task 1 and Task 2 tests. ✓
- Title-number known limitation → pinned test in Task 2 Step 1. ✓
- Docs in sync → Task 3. ✓

**Placeholder scan:** none — every step has concrete code/commands. ✓

**Type consistency:** `inferTime(text, now) → InferredTime | null` is defined in Task 1 and called identically in Task 2. `InferredTime` fields (`start`, `end: Date | null`, `remove: Array<[number, number]>`) are used consistently in both the resolver and the parser branch. `removeSpans` defined and used in Task 2. ✓
