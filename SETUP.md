# Setup

End-to-end checklist to go from zero → calendar event via curl. ~10 minutes.

## 1. Install bun

```bash
curl -fsSL https://bun.sh/install | bash
```

Or on Mac: `brew install bun`. Verify with `bun --version`.

## 2. Lay out the files

Project structure:

```
cal-logger/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── src/
    ├── parser.ts
    ├── parser.test.ts
    ├── calendar.ts
    ├── oauth-setup.ts
    └── server.ts
```

Top-level files at the root, `.ts` files inside `src/`.

## 3. Install deps

```bash
cd cal-logger
bun install
```

## 4. Smoke-test the parser (no Google needed yet)

```bash
bun run test:parser
```

Expected: `12/12 passed`. If yes, the core logic works on your machine. If not, paste the error.

## 5. Get Google credentials

The only fiddly part — Google's console has a lot of screens. ~5 minutes.

### 5a. Create a project
Go to https://console.cloud.google.com → top bar project dropdown → **New Project** → name it anything → Create.

### 5b. Enable the Calendar API
Left nav → **APIs & Services → Library** → search "Google Calendar API" → click → **Enable**.

### 5c. Configure consent screen
Left nav → **APIs & Services → OAuth consent screen**

- User Type: **External** → Create
- App name: `cal-logger` (anything)
- User support email: your email
- Developer contact: your email
- Save and continue through the next screens (you can skip scopes)
- On the **Test users** page: **add your own Google account email** ← important, or you'll get a 403
- Save

### 5d. Create the OAuth client
Left nav → **APIs & Services → Credentials → + Create Credentials → OAuth client ID**

- Application type: **Desktop app**
- Name: `cal-logger`
- Click Create
- In the popup, click **Download JSON**

### 5e. Drop the file into your project
Move the downloaded file (long name like `client_secret_12345.apps.googleusercontent.com.json`) into the project root and **rename it to `credentials.json`**.

## 6. Get a refresh token

```bash
bun run oauth
```

It prints a URL. Open it in your browser:
1. Sign in with the same Google account you added as a test user
2. You'll see "Google hasn't verified this app" — that's expected, it's your personal app
3. Click **Advanced** → **Go to cal-logger (unsafe)** → **Allow**

The browser redirects to localhost:4567, the script catches it, saves `token.json`, prints success.

## 7. Run the server

```bash
bun run dev
```

Expected output: `cal-logger listening on http://localhost:3000`.

## 8. Test it

In another terminal:

```bash
curl -X POST http://localhost:3000/log \
  -H "Content-Type: application/json" \
  -H "X-Auth: dev-secret-change-me" \
  -d '{"text": "test event 3-4pm"}'
```

Expected: JSON with `ok: true` and a `link` to the event. Click the link → it's in your calendar.

To undo:

```bash
curl -X POST http://localhost:3000/undo \
  -H "Content-Type: application/json" \
  -H "X-Auth: dev-secret-change-me" \
  -d '{"event_id": "<event_id from previous response>"}'
```

## Troubleshooting

**"Access blocked: cal-logger has not completed the Google verification process"**
You missed adding yourself as a test user in step 5c. Go back and add it.

**OAuth script hangs**
Port 4567 is already in use. Kill whatever's on it, or change `CALLBACK_PORT` in `src/oauth-setup.ts`.

**`token.json not found` when running the server**
Step 6 was skipped or failed silently. Re-run `bun run oauth`.

**`No refresh_token returned` warning during oauth**
Happens if you've authorized this app before. Go to https://myaccount.google.com/permissions, revoke cal-logger, re-run `bun run oauth`.

**Event created but wrong time**
Check your laptop's timezone matches what you expect. The code uses `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**`unauthorized` from curl**
You forgot the `-H "X-Auth: dev-secret-change-me"` header, or you set a custom `AUTH_SECRET` env var and the header doesn't match.

## Done

Once that curl works, the brain is done. Next step: figure out how you want to actually trigger it (shell alias, iOS Shortcut, email-poller, Telegram, etc.) and/or deploy to Cloudflare Workers so it runs without your laptop.
