# cal-logger

Text in → calendar event out. Type `cal "leetcode 2-4pm"` and it lands on your Google Calendar.

Use it two ways:
- **CLI** (`cal "..."`) — runs on your machine, no server needed. This is the main way.
- **HTTP server** (optional) — for reaching it from somewhere that *isn't* this machine (a phone, a text-message relay, another computer). Off by default.

---

## Syntax

Every entry is a **title**, a **time**, and an optional **note**:

```
<title> <time> [// <note>]
```

### Time — use exactly one form
- **Range:** `2-4pm`, `9-10:30am`, `3-3:30pm`
- **Start + duration:** `2pm 45min`, `6am 1h`, `8pm 90m`, `7am 1.5h`

Duration units: `m` / `min` / `mins` / `minute` / `minutes`, and `h` / `hr` / `hrs` / `hour` / `hours`.
Supplying **both** a range and a duration, or **neither**, is rejected.

### Title
Whatever's left after the time is removed. `coffee w alex 3-3:30pm` → title `coffee w alex`.

### Note (optional)
Anything after ` // ` becomes the event's description (the notes body).
No `//` means no description.

### Examples
| Input | Title | When | Note |
|-------|-------|------|------|
| `leetcode 2-4pm` | leetcode | 2:00–4:00pm | — |
| `deep work 9-10:30am` | deep work | 9:00–10:30am | — |
| `workout 6am 1h` | workout | 6:00–7:00am | — |
| `reading 8pm 90m` | reading | 8:00–9:30pm | — |
| `leetcode 2-4pm // solved DP problems 1-50` | leetcode | 2:00–4:00pm | solved DP problems 1-50 |

Rejected (and why): `meeting 2pm` (no end/duration), `leetcode 2-4pm 1h` (both range and duration), `no time here` (no time).

---

## Setup (~10 min, one-time)

### 1. Install bun
```bash
curl -fsSL https://bun.sh/install | bash   # or: brew install bun
bun --version
```

### 2. Install dependencies
```bash
cd cal-logger
bun install
```

Smoke-test the parser (no Google needed yet):
```bash
bun test     # expect: all passed
```

### 3. Google OAuth credentials
You need a **Desktop** OAuth client for the Google Calendar API, saved as `credentials.json` in the project root.

**If you already have one** (e.g. from another tool like gcalcli): copy that `client_secret_*.json` file in as `credentials.json`. It must be a Desktop client (its JSON has an `"installed"` key).

**Otherwise, create one:**
1. https://console.cloud.google.com → pick or create a project
2. **APIs & Services → Library** → enable **Google Calendar API**
3. **APIs & Services → OAuth consent screen** → User type **External** → add your own Google account under **Test users**
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → type **Desktop app** → **Download JSON**
5. Rename the download to `credentials.json` and put it in the project root

### 4. Authorize (get a refresh token)
```bash
bun run oauth
```
Opens a URL → sign in with the account you added as a test user → you'll see "Google hasn't verified this app" (expected for a personal app) → **Advanced → Go to cal-logger (unsafe) → Allow**. It saves `token.json`.

`credentials.json` and `token.json` are git-ignored — they never get committed.

---

## CLI usage

```bash
cal "leetcode 2-4pm"                       # log an event
cal "leetcode 2-4pm // solved DP 1-50"     # with a note
cal undo <event_id>                        # remove an event (id is printed on create)
cal --help                                 # full syntax
```

`cal` is a fish function at `~/.config/fish/functions/cal.fish` that runs the CLI from anywhere. Open a new terminal (or `exec fish`) after first install. Without the function, run it directly:
```bash
bun run cli "leetcode 2-4pm"
```

---

## Server usage (optional)

Only needed to reach cal-logger from another device. Run it:
```bash
bun run dev                                # http://localhost:3000
```

Endpoints:
- `POST /log` — body `{ "text": "leetcode 2-4pm // note" }` → creates an event
- `POST /undo` — body `{ "event_id": "..." }` → deletes it
- `GET /health` — sanity check

Every request needs an `X-Auth` header matching the server's secret:
```bash
curl -X POST http://localhost:3000/log \
  -H "Content-Type: application/json" \
  -H "X-Auth: dev-secret-change-me" \
  -d '{"text": "leetcode 2-4pm"}'
```

**Auth:** the secret defaults to `dev-secret-change-me`, which is fine for local-only use. Before exposing the server to the internet, set a real one (fish):
```fish
set -x AUTH_SECRET something-private
bun run dev
```
and send that same value as `X-Auth`.

---

## Project layout

```
src/
├── cli.ts          # the `cal` command (talks to Google directly, no server)
├── server.ts       # optional HTTP server (/log, /undo, /health)
├── log-event.ts    # shared "text → calendar event" step (CLI + server both use it)
├── parser.ts       # text → { title, start, end, description }
├── parser.test.ts  # parser tests  (bun test)
├── calendar.ts     # Google Calendar create/delete
└── oauth-setup.ts  # one-time token generator  (bun run oauth)
```

---

## Troubleshooting

- **`credentials.json not found`** — finish Setup step 3.
- **`token.json not found`** — run `bun run oauth` (Setup step 4).
- **"Access blocked / app not verified"** — add your Google account under **Test users** on the OAuth consent screen.
- **`No refresh_token returned`** during oauth — you authorized before; revoke at https://myaccount.google.com/permissions and re-run.
- **oauth script hangs** — port 4567 is in use; free it or change `CALLBACK_PORT` in `src/oauth-setup.ts`.
- **Event created at the wrong time** — check your machine's timezone; the code uses the system zone.
- **`unauthorized` from the server** — your `X-Auth` header doesn't match `AUTH_SECRET`.
