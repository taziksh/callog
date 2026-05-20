# cal-logger

Tiny webhook: text in → calendar event out.

## Setup

### 1. Install
```bash
cd cal-logger
bun install
```

### 2. Get Google OAuth credentials (one-time, ~5 min)
1. Go to https://console.cloud.google.com
2. Create a new project (or pick existing)
3. APIs & Services → Library → search "Google Calendar API" → Enable
4. APIs & Services → OAuth consent screen → External → fill in app name & your email → save
   - Under "Test users", add your own Google account
5. APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Desktop app**
   - Name: anything (e.g. "cal-logger")
6. Download the JSON, rename to `credentials.json`, drop it in this folder

### 3. Get a refresh token
```bash
bun run oauth
```
Opens a URL — click it, sign in, allow. `token.json` is saved automatically.

### 4. Run
```bash
bun run dev
```

### 5. Test
```bash
# basic log
curl -X POST http://localhost:3000/log \
  -H "Content-Type: application/json" \
  -H "X-Auth: dev-secret-change-me" \
  -d '{"text": "leetcode 2-4pm"}'

# undo with the event_id returned above
curl -X POST http://localhost:3000/undo \
  -H "Content-Type: application/json" \
  -H "X-Auth: dev-secret-change-me" \
  -d '{"event_id": "abc123..."}'
```

## Test the parser without Google
```bash
bun run test:parser
```

## Input format (strict)
- **Range**: `leetcode 2-4pm` / `deep work 9-10:30am`
- **Start + duration**: `leetcode 2pm 45min` / `workout 6am 1h`
- Anything else (no end, no duration, both, etc.) → rejected with an error
- Title is whatever's left after stripping the time + duration

## Endpoints
- `POST /log` — body: `{text}` → creates event
- `POST /undo` — body: `{event_id}` → deletes event
- `GET /health` — sanity check

## Auth
Set `AUTH_SECRET` env var before `bun run dev`. Send same value as `X-Auth` header.
