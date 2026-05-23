# Meridiem inference for bare times — design

**Date:** 2026-05-22
**Status:** approved design, pre-implementation
**Component:** `src/parser.ts` (+ `src/parser.test.ts`, README, `cal --help`)

## Problem

The parser requires an explicit `am`/`pm` on every time. Bare times don't work:

- `leetcode 2-4` → `no time found` (chrono-node refuses bare integer ranges)
- `leetcode 2:00-4:00` → parses, but chrono blindly defaults to **2:00 AM–4:00 AM**
- `leetcode 14-16` (24-hour) → `no time found`

There is no inference: the parser never guesses the meridiem, even when the current
time makes one reading obviously intended.

## Goal

Accept bare 12-hour times and 24-hour times, inferring the meridiem by
**most recent past**: a bare time resolves to the latest interpretation that is at or
before "now". Explicit date words (`today`/`tomorrow`/`yesterday`/`tonight`) override
the date; the meridiem is still inferred.

This is a logging tool — you mostly record what already happened — so "most recent past"
is the natural default.

## Approach: numeric pre-resolver, chrono as fallback

Inference cannot be a post-correction of chrono, because chrono returns *nothing* for
bare integer ranges. So a dedicated resolver runs first.

`parse()` flow becomes:

1. **(unchanged)** Split off `// description`.
2. **(unchanged)** Extract a duration token (`45min`, `1h`, …) and remove it.
3. **(new) Trigger guard:** if the remaining text contains **no `am`/`pm` token**, try the
   numeric resolver:
   - If it matches a bare/24h time (range or trailing single), *we* compute `start`/`end`
     and remove the matched substring from the title.
   - If it does not match, fall through to chrono.
4. **(unchanged fallback)** Otherwise (any `am`/`pm` present, or no numeric match) use the
   existing chrono path. Every currently-passing case keeps going through chrono untouched.

Rationale: chrono already handles every explicit case correctly (all current tests pass).
We add one path for what it can't do rather than replacing a working dependency.

## The inference algorithm

### Token shapes the numeric resolver matches

Only when **no `am`/`pm` is present** in the time text:

- **Range:** `H[:MM] <sep> H[:MM]`, where `<sep>` is `-`, ` - `, `–`, or `to`
  (matches the existing range separators). Matched anywhere in the text.
  Examples: `2-4`, `9-10:30`, `2:00-4:00`, `14-16`, `9-17`, `2 to 4`.
- **Single time (for start+duration):** `H[:MM]` matched **only at the trailing position**
  (end of the remaining text), so a number earlier in the title isn't mistaken for the time.
  Examples: `… 2`, `… 9:30`, `… 14`.

`H` is 0–23. `:MM` optional.

### Resolve START — most recent past

- **Unambiguous hour** (`0`, or `13`–`23`): that clock time **today**; if it is still in
  the future, roll back one day.
- **Ambiguous hour** (`1`–`12`): candidate starts = that hour as **AM and PM**, for
  **today and yesterday** (four candidates). Pick the **latest candidate ≤ now**.
  The yesterday candidates are what resolve the all-future boundary case (see below).

### Resolve END — range only

The **first occurrence of the end clock time strictly after `start`**:

- End hour ambiguous (`1`–`12`): pick the meridiem giving the **smallest end after start**
  → `11-1` becomes 11 AM–1 PM; `2-4` becomes 2–4 in the same half.
- End hour unambiguous (`0`, `13`–`23`): that clock time on start's day; `+24h` if not
  after start.

This guarantees `end > start`, and inferred spans naturally stay under 24h.

### Start + duration

Resolve `start` as above; `end = start + durationMinutes` (existing logic).

### Date words override the date

If the time text contains a date word, the word sets the **date**; the inferred clock time
and meridiem from the steps above are **stamped onto that date**:

| word | effect |
|------|--------|
| `today` | date = today, meridiem inferred as normal |
| `tomorrow` | date = today + 1, meridiem inferred as normal |
| `yesterday` | date = today − 1, meridiem inferred as normal |
| `tonight` | date = today, meridiem **forced to PM** (evening) |

Procedure: run the most-recent-past resolution first (yielding hour:min + meridiem, on
today or yesterday), then if a date word is present, replace the **date** component with
the word's date, keeping hour:min:meridiem. Recompute `end` as the first occurrence after
the (possibly relocated) start.

Examples at `now = 3:00 PM`:

- `meeting tomorrow 9-10` → infer 9 → 9 AM; word → tomorrow → **tomorrow 9–10 AM**
- `review yesterday 2-4` → infer 2 → 2 PM; word → yesterday → **yesterday 2–4 PM**
- `tonight 8-9` → forced PM → **today 8–9 PM**

Note: with an explicit `am`/`pm`, dated entries already route through chrono unchanged
(`meeting tomorrow 9-10am`).

## Worked examples (now = Friday 3:00 PM unless noted)

| input | result | why |
|-------|--------|-----|
| `leetcode 2-4` | Fri 2–4 PM | 2 PM is the latest ≤ now |
| `deep work 9-11` | Fri 9–11 AM | 9 PM is future; 9 AM is most recent past |
| `lunch 2-3` *(now 1 PM)* | 2–3 AM | 2 PM is future; 2 AM is most recent past (accepted boundary surprise) |
| `2-4` *(now 1 AM)* | **Thu** 2–4 PM | nothing today is past → yesterday's most recent past |
| `sync 11-1` | Fri 11 AM–1 PM | end = first 1 after 11 AM |
| `block 14-16` | Fri 2–4 PM | 24h, unambiguous |
| `block 9-17` | Fri 9 AM–5 PM | 9 inferred AM; 17 fixed 5 PM |
| `task 2:00-4:00` | Fri 2–4 PM | no longer chrono's AM default |
| `lap 2 45min` | Fri 2:00–2:45 PM | trailing single + duration |
| `do 3 problems 2 45min` | title `do 3 problems`, 2:00–2:45 PM | trailing single picks 2, not 3 |

## Known limitations (documented, pinned in tests)

- **Title-number collision (residual):** trailing-anchor matching makes single-time
  collisions rare, but a number sitting immediately before the time can still be
  ambiguous (`do 5 2 30min` is ambiguous to a human too). Same family as the existing
  `swim 50m` limitation. Pinned, not silent.
- **Unhandled date words:** only `today`/`tomorrow`/`yesterday`/`tonight` are recognized
  by the resolver. `noon` (no digits) still resolves via the chrono fallback. Other date
  phrases combined with a bare time resolve by recency, ignoring the phrase — add `am`/`pm`
  to route such inputs through chrono.

## Testing

Add a `describe('meridiem inference')` block in `src/parser.test.ts` with a fixed `now`,
covering every row of the worked-examples table plus the date-word cases, written in the
same readable style as the existing tests (a fixed `now`, `mins()` / title assertions).
Specifically:

- bare ranges: `2-4`→PM, `9-11`→AM, `11-1` crossing noon
- boundary: `lunch 2-3` at 1 PM → AM; `2-4` at 1 AM → yesterday PM
- 24-hour: `14-16`, mixed `9-17`
- `2:00-4:00` no longer defaulting to AM
- start+duration: `lap 2 45min`; title-number `do 3 problems 2 45min`
- date words: `meeting tomorrow 9-10`, `review yesterday 2-4`, `tonight 8-9`
- a pinned known-limitation test for the residual title-number collision

**All existing tests must continue to pass unchanged** — the chrono path is not modified.

## Docs (keep in sync, same change)

- README "Time" section: document bare 12-hour times, 24-hour times, the most-recent-past
  rule, and the date-word behavior.
- `cal --help` text: mirror the same.
