import { parse } from './parser.js';
import { createEvent } from './calendar.js';

export interface LogResult {
  ok: true;
  title: string;
  start: Date;
  end: Date;
  description: string | null;
  eventId: string | null;
  link: string | null;
}

export interface LogFailure {
  ok: false;
  error: string;
}

// The shared "text → calendar event" step. Both the CLI and the server call this,
// so the parse+create logic lives in exactly one place.
export async function logEvent(text: string): Promise<LogResult | LogFailure> {
  const parsed = parse(text);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const event = await createEvent(parsed.title, parsed.start, parsed.end, parsed.description);
  return {
    ok: true,
    title: parsed.title,
    start: parsed.start,
    end: parsed.end,
    description: parsed.description ?? null,
    eventId: event.id,
    link: event.htmlLink,
  };
}
