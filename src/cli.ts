#!/usr/bin/env bun
import { logEvent } from './log-event.js';
import { deleteEvent } from './calendar.js';

const args = process.argv.slice(2);

// `cal undo <event_id>` — remove an event you just created
if (args[0] === 'undo') {
  const id = args[1];
  if (!id) {
    console.error('usage: cal undo <event_id>');
    process.exit(1);
  }
  try {
    await deleteEvent(id);
    console.log('✓ removed');
  } catch (e: any) {
    console.error(`✗ ${e.message ?? 'could not remove event'}`);
    process.exit(1);
  }
  process.exit(0);
}

// `cal "leetcode 2-4pm"` — log an event
const text = args.join(' ').trim();
if (!text) {
  console.error('usage: cal "leetcode 2-4pm"');
  process.exit(1);
}

const fmt = (d: Date) =>
  d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

try {
  const result = await logEvent(text);
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    process.exit(1);
  }
  console.log(`✓ ${result.title}`);
  console.log(`  ${fmt(result.start)} → ${fmt(result.end)}`);
  if (result.description) console.log(`  note: ${result.description}`);
  if (result.eventId) console.log(`  undo: cal undo ${result.eventId}`);
} catch (e: any) {
  console.error(`✗ ${e.message ?? 'calendar error'}`);
  process.exit(1);
}
