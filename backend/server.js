import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SCRAPINGDOG_API_KEY = process.env.SCRAPINGDOG_API_KEY || '';
const BACKEND_TOKEN = process.env.BACKEND_TOKEN || '';

const waitlist = [];

function auth(req, res, next) {
  if (!BACKEND_TOKEN) return next();
  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${BACKEND_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    service: 'reviewiq-backend',
    anthropic: !!ANTHROPIC_API_KEY,
    scrapingdog: !!SCRAPINGDOG_API_KEY,
    now: new Date().toISOString()
  });
});

app.post('/api/waitlist', auth, (req, res) => {
  const { email, source, ts } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  waitlist.push({ email, source: source || 'unknown', ts: ts || new Date().toISOString() });
  return res.json({ ok: true, count: waitlist.length });
});

app.post('/api/reviews/scrape', auth, async (req, res) => {
  try {
    const { asin, country = 'us' } = req.body || {};
    if (!asin) return res.status(400).json({ error: 'asin is required' });
    if (!SCRAPINGDOG_API_KEY) return res.status(500).json({ error: 'SCRAPINGDOG_API_KEY missing' });

    const url = `https://api.scrapingdog.com/amazon/reviews?api_key=${encodeURIComponent(SCRAPINGDOG_API_KEY)}&asin=${encodeURIComponent(asin)}&country=${encodeURIComponent(country)}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `Scrapingdog error ${r.status}` });
    const d = await r.json();
    return res.json({ reviews: d.reviews || d || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'scrape failed' });
  }
});

async function callAnthropic(prompt, max_tokens = 1200) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Anthropic error ${r.status}`);
  return data?.content?.[0]?.text || '';
}

app.post('/api/copy/generate', auth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const text = await callAnthropic(prompt, 900);
    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'copy generation failed' });
  }
});

app.post('/api/reviews/analyze', auth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const text = await callAnthropic(prompt, 1400);
    let report;
    try {
      report = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Could not parse JSON report from model response');
      report = JSON.parse(m[0]);
    }
    return res.json({ report });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'analysis failed' });
  }
});

app.listen(PORT, () => {
  console.log(`ReviewIQ backend listening on :${PORT}`);
});
