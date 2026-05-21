#!/usr/bin/env bun
import { logEvent } from './log-event.js';
import { deleteEvent } from './calendar.js';

const args = process.argv.slice(2);

const HELP = `cal — log a calendar event from a line of text

Usage:
  cal <title> <time> [// <note>]
  cal undo <event_id>
  cal --help
                                   <…> required   […] optional

Arguments:
  <title>   event name, e.g. "deep work"
  <time>    one of:
              <start>-<end>      2-4pm        9-10:30am
              <start> <length>   2pm 45min    6am 1h
            length units: m/min, h/hr
  <note>    text after //, saved as the event's description

Examples:
  cal leetcode 2-4pm
  cal deep work 9-10:30am // finish the spec
  cal workout 6am 1h
  cal "alex's 1:1 3-4pm"      (use quotes when the entry has ' or |)
  cal undo 9f8bb4lp3d16ba3nh903hmp49k`;

if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
  console.log(HELP);
  process.exit(0);
}

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
  console.error('usage: cal <title> <time> [// <note>]   (cal --help for more)');
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
