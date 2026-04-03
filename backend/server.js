import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const REQUIRE_BACKEND_TOKEN = (process.env.REQUIRE_BACKEND_TOKEN || 'true').toLowerCase() === 'true';
const WAITLIST_REQUIRE_AUTH = (process.env.WAITLIST_REQUIRE_AUTH || 'false').toLowerCase() === 'true';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SCRAPINGDOG_API_KEY = process.env.SCRAPINGDOG_API_KEY || '';
const BACKEND_TOKEN = process.env.BACKEND_TOKEN || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 90);
const EXTERNAL_TIMEOUT_MS = Number(process.env.EXTERNAL_TIMEOUT_MS || 25000);
const EXTERNAL_RETRIES = Number(process.env.EXTERNAL_RETRIES || 1);

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_STARTER = process.env.STRIPE_PRICE_STARTER || '';
const STRIPE_PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || '';
const STRIPE_PRICE_SCALE = process.env.STRIPE_PRICE_SCALE || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

// Optional Supabase REST persistence for waitlist
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'waitlist_signups';

const DATA_DIR = path.join(__dirname, 'data');
const WAITLIST_FILE = path.join(DATA_DIR, 'waitlist.json');
const rateMap = new Map();
let waitlistWriteLock = Promise.resolve();

if (NODE_ENV === 'production' && REQUIRE_BACKEND_TOKEN && !BACKEND_TOKEN) {
  console.error('FATAL: BACKEND_TOKEN is required in production when REQUIRE_BACKEND_TOKEN=true.');
  process.exit(1);
}

app.use((req, res, next) => {
  const rid = req.headers['x-request-id']?.toString() || crypto.randomUUID();
  req.rid = rid;
  const started = Date.now();
  res.setHeader('x-request-id', rid);
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(JSON.stringify({
      level: 'info',
      rid,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
    }));
  });
  next();
});

app.use(cors({
  origin(origin, cb) {
    if (!origin || CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  }
}));

function auth(req, res, next) {
  if (!BACKEND_TOKEN) return next();
  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${BACKEND_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized', rid: req.rid });
}

function maybeAuth(req, res, next) {
  if (!WAITLIST_REQUIRE_AUTH) return next();
  return auth(req, res, next);
}

function rateLimit(req, res, next) {
  const key = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = rateMap.get(key) || { c: 0, exp: now + RATE_LIMIT_WINDOW_MS };
  if (now > rec.exp) {
    rec.c = 0;
    rec.exp = now + RATE_LIMIT_WINDOW_MS;
  }
  rec.c += 1;
  rateMap.set(key, rec);
  if (rec.c > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryInMs: rec.exp - now, rid: req.rid });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap.entries()) {
    if (now > v.exp + RATE_LIMIT_WINDOW_MS) rateMap.delete(k);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function retryExternal(fn, retries = EXTERNAL_RETRIES) {
  let err;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      if (i === retries) break;
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw err;
}

function hasSupabaseWaitlist() {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(WAITLIST_FILE);
  } catch {
    await fs.writeFile(WAITLIST_FILE, '[]', 'utf8');
  }
}

async function appendWaitlistFile(entry) {
  waitlistWriteLock = waitlistWriteLock.catch(() => {}).then(async () => {
    await ensureDataFile();
    const prev = JSON.parse(await fs.readFile(WAITLIST_FILE, 'utf8'));
    const exists = prev.some(r => String(r.email||'').toLowerCase() === String(entry.email||'').toLowerCase());
    if (!exists) prev.push(entry);
    await fs.writeFile(WAITLIST_FILE, JSON.stringify(prev, null, 2), 'utf8');
    return { count: prev.length, existed: exists };
  });
  return waitlistWriteLock;
}

async function appendWaitlistSupabase(entry) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}`;
  const r = await retryExternal(() => fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify([entry])
  }));
  const payload = await r.text();
  if (!r.ok) throw new Error(`Supabase insert failed (${r.status}): ${payload}`);
  return 1;
}

async function persistWaitlist(entry) {
  if (hasSupabaseWaitlist()) {
    await appendWaitlistSupabase(entry);
    return { mode: 'supabase' };
  }
  const result = await appendWaitlistFile(entry);
  return { mode: 'file', ...result };
}

async function callAnthropic(prompt, max_tokens = 1200) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await retryExternal(() => fetchWithTimeout('https://api.anthropic.com/v1/messages', {
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
  }));
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Anthropic error ${r.status}`);
  return data?.content?.[0]?.text || '';
}

function readiness() {
  const stripeReady = !!(STRIPE_SECRET_KEY && STRIPE_PRICE_STARTER && STRIPE_PRICE_GROWTH && STRIPE_PRICE_SCALE);
  return {
    anthropic: !!ANTHROPIC_API_KEY,
    scrapingdog: !!SCRAPINGDOG_API_KEY,
    waitlistPersistence: hasSupabaseWaitlist() ? 'supabase' : 'file',
    stripe: stripeReady,
    authTokenSet: !!BACKEND_TOKEN || !REQUIRE_BACKEND_TOKEN,
    waitlistAuthRequired: WAITLIST_REQUIRE_AUTH,
    corsLocked: !(CORS_ORIGINS.length === 1 && CORS_ORIGINS[0] === '*')
  };
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'reviewiq-backend', now: new Date().toISOString(), readiness: readiness() });
});

app.get('/api/ready', (_, res) => {
  const r = readiness();
  const ok = r.anthropic && r.scrapingdog && r.authTokenSet && r.corsLocked;
  res.status(ok ? 200 : 503).json({ ok, readiness: r });
});

app.post('/api/waitlist', rateLimit, maybeAuth, async (req, res) => {
  try {
    const { email, source, ts } = req.body || {};
    if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'Valid email required', rid: req.rid });
    const meta = await persistWaitlist({ email: String(email).trim().toLowerCase(), source: source || 'unknown', ts: ts || new Date().toISOString() });
    return res.json({ ok: true, persistence: meta.mode, existed: !!meta.existed, rid: req.rid });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'waitlist write failed', rid: req.rid });
  }
});

app.post('/api/reviews/scrape', rateLimit, auth, async (req, res) => {
  try {
    const { asin, country = 'us' } = req.body || {};
    if (!asin) return res.status(400).json({ error: 'asin is required', rid: req.rid });
    if (!SCRAPINGDOG_API_KEY) return res.status(500).json({ error: 'SCRAPINGDOG_API_KEY missing', rid: req.rid });

    const url = `https://api.scrapingdog.com/amazon/reviews?api_key=${encodeURIComponent(SCRAPINGDOG_API_KEY)}&asin=${encodeURIComponent(asin)}&country=${encodeURIComponent(country)}`;
    const r = await retryExternal(() => fetchWithTimeout(url));
    if (!r.ok) return res.status(r.status).json({ error: `Scrapingdog error ${r.status}`, rid: req.rid });
    const d = await r.json();
    return res.json({ reviews: d.reviews || d || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'scrape failed', rid: req.rid });
  }
});

app.post('/api/copy/generate', rateLimit, auth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required', rid: req.rid });
    const text = await callAnthropic(prompt, 900);
    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'copy generation failed', rid: req.rid });
  }
});

app.post('/api/reviews/analyze', rateLimit, auth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required', rid: req.rid });
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
    return res.status(500).json({ error: e.message || 'analysis failed', rid: req.rid });
  }
});

app.post('/api/billing/create-checkout-session', rateLimit, auth, async (req, res) => {
  try {
    const { plan = 'growth' } = req.body || {};
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY missing', rid: req.rid });

    const priceMap = { starter: STRIPE_PRICE_STARTER, growth: STRIPE_PRICE_GROWTH, scale: STRIPE_PRICE_SCALE };
    const price = priceMap[plan];
    if (!price) return res.status(400).json({ error: `Price for plan '${plan}' is not configured`, rid: req.rid });

    const stripeRes = await retryExternal(() => fetchWithTimeout('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `riq-${req.rid}-${plan}`
      },
      body: new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        success_url: `${APP_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_BASE_URL}/cancelled`
      })
    }));

    const payload = await stripeRes.json();
    if (!stripeRes.ok) return res.status(stripeRes.status).json({ error: payload?.error?.message || 'Stripe session failed', rid: req.rid });
    return res.json({ checkoutUrl: payload.url, sessionId: payload.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'billing failed', rid: req.rid });
  }
});

app.use((err, req, res, _next) => {
  if (String(err.message || '').includes('CORS blocked')) {
    return res.status(403).json({ error: 'CORS blocked', rid: req?.rid });
  }
  return res.status(500).json({ error: 'Unexpected server error', rid: req?.rid });
});

app.listen(PORT, () => {
  const r = readiness();
  console.log(JSON.stringify({ level: 'info', msg: 'ReviewIQ backend listening', port: PORT, env: NODE_ENV, readiness: r }));
});
