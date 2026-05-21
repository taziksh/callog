import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

// Anchor to the project root (one level up from src/) so the CLI finds these
// no matter which directory it's invoked from.
const ROOT = path.resolve(import.meta.dir, '..');
const CRED_PATH = path.join(ROOT, 'credentials.json');
const TOKEN_PATH = path.join(ROOT, 'token.json');

function loadAuth() {
  if (!fs.existsSync(CRED_PATH)) {
    throw new Error('credentials.json not found. See README.');
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('token.json not found. Run: bun run oauth');
  }
  const credentials = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const conf = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(conf.client_id, conf.client_secret, conf.redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

export async function createEvent(title: string, start: Date, end: Date) {
  const auth = loadAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
    },
  });

  return {
    id: res.data.id ?? null,
    htmlLink: res.data.htmlLink ?? null,
  };
}

export async function deleteEvent(eventId: string) {
  const auth = loadAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: 'primary', eventId });
}
