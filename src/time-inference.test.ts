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
