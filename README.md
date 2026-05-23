# callog

A quick way to add events to your Google Calendar from the terminal. Run `cal "leetcode 2-4pm"` and it's on your calendar.

It's mainly a CLI. There's also a small HTTP server for reaching it from your phone or another machine, but it stays off unless you start it.

## Writing an entry

The format is:

```
<title> <time> [// <note>]
```

The time can be a range like `2-4pm` or `9-10:30am`, or a start time plus a duration like `2pm 45min`, `6am 1h`, or `7am 1.5h`. Durations accept `m`, `min`, `minute`, `minutes` and `h`, `hr`, `hour`, `hours`. Use one form or the other; a range and a duration together, or neither, is rejected.

You can leave off am/pm. When you do, callog picks the most recent time that's already passed, so at 3pm `2-4` is the afternoon and `9-11` is the morning. If both would still be in the future (e.g. it's 1am), it assumes you meant yesterday. 24-hour times also work, so `14-16` is the same as 2-4pm.

You can start with a day word too: `meeting tomorrow 9-10`, `review yesterday 2-4`, or `tonight 8-9`. `tonight` counts as pm.

Whatever's left after the time becomes the title, and anything after a ` // ` becomes the event's notes.

Some examples:

| You type | Title | When | Note |
|----------|-------|------|------|
| `leetcode 2-4pm` | leetcode | 2 to 4pm | |
| `workout 6am 1h` | workout | 6 to 7am | |
| `leetcode 2-4` at 3pm | leetcode | 2 to 4pm | |
| `meeting tomorrow 9-10` | meeting | tomorrow, 9 to 10am | |
| `leetcode 2-4pm // solved DP 1-50` | leetcode | 2 to 4pm | solved DP 1-50 |

And some things that get rejected: `meeting 2pm` (no end or duration), `leetcode 2-4pm 1h` (both a range and a duration), and `no time here` (no time at all).

## Setup

First, install bun:

```bash
brew install bun        # or: curl -fsSL https://bun.sh/install | bash
bun install
bun test                # checks the parser works, no Google needed
```

Next, callog needs access to your calendar, which means a Desktop OAuth client saved as `credentials.json` in the project root. (You can tell it's the right type because the JSON has an `"installed"` key.) If you already have one from something like gcalcli, just copy it in. Otherwise, in the [Google Cloud Console](https://console.cloud.google.com):

1. Enable the Google Calendar API
2. On the OAuth consent screen, set the user type to External and add your account under Test users
3. Create an OAuth client ID, choose Desktop app, and download the JSON as `credentials.json`

Then authorize:

```bash
bun run oauth
```

This sends you to Google to sign in. You'll see an "app isn't verified" warning, which is expected for a personal tool, so click Advanced, then Go to callog, then Allow. It saves a `token.json`. Both that and `credentials.json` are git-ignored.

## Using the CLI

```bash
cal leetcode 2-4pm
cal leetcode 2-4pm // solved DP 1-50
cal "alex's 1:1 3-4pm"        # quote anything containing a ' or |
cal undo <event_id>           # the id is printed when you create an event
cal --help
```

If you haven't set up a `cal` alias yet, you can run it directly with `bun run cli "leetcode 2-4pm"`.

## The server (optional)

You only need this to reach callog from another device.

```bash
bun run dev                   # http://localhost:3000
```

The endpoints are:

- `POST /log` with `{ "text": "leetcode 2-4pm // note" }` to create an event
- `POST /undo` with `{ "event_id": "..." }` to delete one
- `GET /health` to check it's running

Every request needs an `X-Auth` header matching `AUTH_SECRET`. It defaults to `dev-secret-change-me`, which is fine locally, but set a real one before exposing the server:

```fish
set -x AUTH_SECRET something-private
bun run dev
```

A request looks like:

```bash
curl -X POST http://localhost:3000/log \
  -H "Content-Type: application/json" \
  -H "X-Auth: dev-secret-change-me" \
  -d '{"text": "leetcode 2-4pm"}'
```

## Project layout

```
src/cli.ts          # the cal command
src/server.ts       # the optional HTTP server
src/log-event.ts    # shared text-to-event logic, used by both
src/parser.ts       # turns text into { title, start, end, description }
src/calendar.ts     # talks to Google Calendar
src/oauth-setup.ts  # token setup for bun run oauth
```

## Troubleshooting

- **`credentials.json` or `token.json` not found:** finish setup, or run `bun run oauth`.
- **"Access blocked" / "app not verified":** add your account under Test users on the consent screen.
- **`No refresh_token returned` during oauth:** you've authorized before. Revoke callog at [Google permissions](https://myaccount.google.com/permissions) and run it again.
- **oauth hangs:** something is using port 4567. Free it, or change `CALLBACK_PORT` in `src/oauth-setup.ts`.
- **Event created at the wrong time:** callog uses your machine's timezone, so check that.
- **Server returns `unauthorized`:** your `X-Auth` header doesn't match `AUTH_SECRET`.
