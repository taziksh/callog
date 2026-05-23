import { describe, test, expect } from 'bun:test';
import { parse, type ParsedEvent } from './parser.js';

// Fixed "now" so chrono is deterministic.
const now = new Date('2026-05-15T10:00:00-07:00');

function ok(input: string): ParsedEvent {
  const r = parse(input, now);
  if ('error' in r) throw new Error(`expected ok, got error "${r.error}"  (input: ${JSON.stringify(input)})`);
  return r;
}
function errOf(input: string): string {
  const r = parse(input, now);
  if (!('error' in r)) throw new Error(`expected error, got ok  (input: ${JSON.stringify(input)})`);
  return r.error;
}
// Duration in minutes — timezone-independent, so these assertions don't depend on the host TZ.
const mins = (e: ParsedEvent) => (e.end.getTime() - e.start.getTime()) / 60000;

describe('ranges', () => {
  test('basic pm range', () => {
    const e = ok('leetcode 2-4pm');
    expect(e.title).toBe('leetcode');
    expect(mins(e)).toBe(120);
  });
  test('range with minutes', () => expect(mins(ok('deep work 9-10:30am'))).toBe(90));
  test('both meridiems, crossing noon', () => {
    expect(mins(ok('lunch 11am-1pm'))).toBe(120);
    expect(mins(ok('meet 10:30am-12:30pm'))).toBe(120);
  });
  test('separators: hyphen / spaced hyphen / "to"', () => {
    for (const s of ['review 2pm-4pm', 'review 2 - 4pm', 'review 2 to 4pm']) {
      expect(mins(ok(s))).toBe(120);
    }
  });
});

describe('durations', () => {
  test('minutes', () => expect(mins(ok('leetcode 2pm 45min'))).toBe(45));
  test('hours', () => expect(mins(ok('workout 6am 1h'))).toBe(60));
  test('bare m', () => expect(mins(ok('reading 8pm 90m'))).toBe(90));
  test('decimal hours, duration before the time', () => expect(mins(ok('gym 1.5h 7am'))).toBe(90));
  test('spelled-out units', () => {
    expect(mins(ok('task 2pm 30 minutes'))).toBe(30);
    expect(mins(ok('task 2pm 2 hours'))).toBe(120);
    expect(mins(ok('task 2pm 2hrs'))).toBe(120);
  });
});

describe('whitespace tolerance', () => {
  test('extra and trailing spaces', () => {
    expect(ok('leetcode   2-4pm').title).toBe('leetcode');
    expect(ok('leetcode 2-4pm   ').title).toBe('leetcode');
    expect(mins(ok('leetcode 2pm   45min'))).toBe(45);
  });
});

describe('description (//)', () => {
  test('captures the note', () => expect(ok('leetcode 2-4pm // solved DP').description).toBe('solved DP'));
  test('no // → undefined', () => expect(ok('leetcode 2-4pm').description).toBeUndefined());
  test('note is trimmed', () => expect(ok('leetcode 2-4pm //   spaced note  ').description).toBe('spaced note'));
});

describe('rejections', () => {
  test('no end or duration', () => expect(errOf('meeting 2pm')).toMatch(/range|duration/));
  test('both range and duration', () => expect(errOf('leetcode 2-4pm 1h')).toMatch(/either/));
  test('no title', () => expect(errOf('2-4pm')).toMatch(/title/));
  test('no time', () => expect(errOf('no time here')).toMatch(/no time/));
  test('bare space is not a range', () => expect('error' in parse('leetcode 2 4pm', now)).toBe(true));
  test('empty', () => expect(errOf('')).toMatch(/empty/));
  test('note only, no title/time', () => expect(errOf('// just a note')).toMatch(/title/));
});

// Known limitation, pinned so we notice if it ever changes: a measurement in the
// title that looks like a duration ("50m") is grabbed as the duration.
describe('known limitations', () => {
  test('a "50m" in the title collides with duration parsing', () => {
    expect(mins(ok('swim 50m 6am'))).toBe(50);
  });
});

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

// Adversarial inputs must never throw — they should come back as a clean error
// or a well-formed event, never a crash.
describe('junk input never crashes', () => {
  const junk = [
    '', '   ', '\n\t', '//', '////', ' // ',
    '-', '--', '::::', ';;;', '....',
    '🎉🎊 2-4pm', '日本語のタイトル 2-4pm', '日本語 only',
    'a'.repeat(5000), '1'.repeat(1000),
    'undefined', 'null', 'NaN', '0',
    '2-4pm-6pm', '9-10-11am', 'at noon tomorrow then later',
    String.fromCharCode(0) + ' weird 2-4pm',
  ];
  for (const input of junk) {
    test(`handles ${JSON.stringify(input.length > 20 ? input.slice(0, 20) + '…' : input)}`, () => {
      const r = parse(input, now); // throwing here fails the test
      if ('error' in r) {
        expect(typeof r.error).toBe('string');
        expect(r.error.length).toBeGreaterThan(0);
      } else {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.end.getTime()).toBeGreaterThan(r.start.getTime());
      }
    });
  }
});
