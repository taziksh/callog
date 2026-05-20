import express, { Request, Response } from 'express';
import { parse } from './parser.js';
import { createEvent, deleteEvent } from './calendar.js';

const app = express();
app.use(express.json());

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-me';
const PORT = Number(process.env.PORT ?? 3000);

function authOk(req: Request) {
  return req.headers['x-auth'] === AUTH_SECRET;
}

app.post('/log', async (req: Request, res: Response) => {
  if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });

  const { text } = req.body ?? {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'missing or invalid `text`' });
  }

  const parsed = parse(text);
  if ('error' in parsed) {
    return res.status(400).json(parsed);
  }

  try {
    const event = await createEvent(parsed.title, parsed.start, parsed.end);
    return res.json({
      ok: true,
      title: parsed.title,
      start: parsed.start.toISOString(),
      end: parsed.end.toISOString(),
      event_id: event.id,
      link: event.htmlLink,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message ?? 'calendar error' });
  }
});

app.post('/undo', async (req: Request, res: Response) => {
  if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const { event_id } = req.body ?? {};
  if (typeof event_id !== 'string') {
    return res.status(400).json({ error: 'missing event_id' });
  }
  try {
    await deleteEvent(event_id);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`cal-logger listening on http://localhost:${PORT}`);
  console.log(`auth secret: ${AUTH_SECRET === 'dev-secret-change-me' ? '(default — set AUTH_SECRET env var)' : '(custom)'}`);
});
