import { google } from 'googleapis';
import fs from 'node:fs';
import http from 'node:http';
import { URL } from 'node:url';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const CALLBACK_PORT = 4567;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/oauth2callback`;

async function main() {
  if (!fs.existsSync('credentials.json')) {
    console.error('credentials.json not found. See README for how to download it from Google Cloud Console.');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
  const conf = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(conf.client_id, conf.client_secret, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces refresh_token to be returned
    scope: SCOPES,
  });

  console.log('\nOpen this URL in your browser to authorize:\n');
  console.log(authUrl);
  console.log('\nWaiting for redirect...');

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`);
        const c = url.searchParams.get('code');
        if (c) {
          res.end('Auth successful. You can close this tab.');
          server.close();
          resolve(c);
        } else {
          res.end('No code in callback.');
        }
      } catch (e) {
        reject(e);
      }
    });
    server.listen(CALLBACK_PORT);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.warn('\nWarning: no refresh_token returned. You may need to revoke access at https://myaccount.google.com/permissions and re-run this.');
  }
  fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
  console.log('\nSaved token.json. You can now run: bun run dev');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
