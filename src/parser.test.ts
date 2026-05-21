import { parse } from './parser.js';

// Fixed "now" so tests are deterministic
const now = new Date('2026-05-15T10:00:00-07:00');

const cases = [
  // Should succeed
  { input: 'leetcode 2-4pm', want: 'ok' },
  { input: 'deep work on design doc 9-10:30am', want: 'ok' },
  { input: 'leetcode 2pm 45min', want: 'ok' },
  { input: 'workout 6am 1h', want: 'ok' },
  { input: 'coffee w alex 3-3:30pm', want: 'ok' },
  { input: 'reading 8pm 90m', want: 'ok' },
  { input: 'gym 1.5h 7am', want: 'ok' },
  { input: 'leetcode 2-4pm // solved DP problems 1-50', want: 'ok' },
  { input: 'workout 6am 1h // legs day', want: 'ok' },

  // Should reject
  { input: 'meeting 2pm', want: 'reject' },
  { input: 'leetcode 2-4pm 1h', want: 'reject' },
  { input: '2-4pm', want: 'reject' },
  { input: 'no time here', want: 'reject' },
  { input: '// just a note', want: 'reject' },
  { input: '', want: 'reject' },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
  const result = parse(c.input, now);
  const isError = 'error' in result;
  const got = isError ? 'reject' : 'ok';
  const ok = got === c.want;
  const marker = ok ? '✓' : '✗';
  console.log(`${marker} [${c.want}] "${c.input}"`);
  if (!isError) {
    const desc = result.description ? `  note="${result.description}"` : '';
    console.log(`    title="${result.title}"  ${result.start.toISOString()} → ${result.end.toISOString()}${desc}`);
  } else {
    console.log(`    error: ${result.error}`);
  }
  if (ok) passed++; else failed++;
}

console.log(`\n${passed}/${cases.length} passed${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
