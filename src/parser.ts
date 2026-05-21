import * as chrono from 'chrono-node';

export interface ParsedEvent {
  title: string;
  start: Date;
  end: Date;
  description?: string;
}

export interface ParseError {
  error: string;
}

// Matches duration tokens: "45min", "45 mins", "1h", "1.5h", "2hr", "90m"
const DURATION_RE = /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i;

export function parse(text: string, now: Date = new Date()): ParsedEvent | ParseError {
  const trimmed = text.trim();
  if (!trimmed) return { error: 'empty input' };

  // 0. Split off an optional description after "//"  (e.g. "leetcode 2-4pm // solved DP")
  let description: string | undefined;
  let titlePart = trimmed;
  const descIdx = trimmed.indexOf('//');
  if (descIdx !== -1) {
    description = trimmed.slice(descIdx + 2).trim() || undefined;
    titlePart = trimmed.slice(0, descIdx).trim();
  }
  if (!titlePart) return { error: 'no title found' };

  // 1. Try to find a duration token first, remove it so chrono doesn't get confused
  let durationMinutes: number | null = null;
  let working = titlePart;
  const durMatch = titlePart.match(DURATION_RE);
  if (durMatch) {
    const n = parseFloat(durMatch[1]);
    const unit = durMatch[2].toLowerCase();
    durationMinutes = unit.startsWith('h') ? Math.round(n * 60) : Math.round(n);
    working = (titlePart.slice(0, durMatch.index!) + titlePart.slice(durMatch.index! + durMatch[0].length))
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 2. Parse remaining text for time references
  const results = chrono.parse(working, now, { forwardDate: false });
  if (results.length === 0) {
    return { error: 'no time found. use "title 2-4pm" or "title 2pm 45min"' };
  }
  if (results.length > 1) {
    return { error: 'multiple time expressions found; please use one' };
  }

  const r = results[0];
  const hasRange = r.end !== undefined && r.end !== null;
  const hasDuration = durationMinutes !== null;

  // 3. Strict validation: exactly one of {range, start+duration}
  if (hasRange && hasDuration) {
    return { error: 'specify either a range OR a start+duration, not both' };
  }
  if (!hasRange && !hasDuration) {
    return { error: 'need either a range (e.g. 2-4pm) or a duration (e.g. 2pm 45min)' };
  }

  const start = r.start.date();
  const end = hasRange
    ? r.end!.date()
    : new Date(start.getTime() + durationMinutes! * 60 * 1000);

  if (end <= start) {
    return { error: 'end time is not after start time' };
  }

  // 4. Title = everything except the parsed time substring
  const before = working.slice(0, r.index);
  const after = working.slice(r.index + r.text.length);
  const title = (before + ' ' + after).replace(/\s+/g, ' ').trim();

  if (!title) return { error: 'no title found' };

  return { title, start, end, description };
}
