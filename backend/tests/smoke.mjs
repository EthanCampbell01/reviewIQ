import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 4117;
const base = `http://127.0.0.1:${PORT}`;

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function waitForHealth(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('server did not become healthy');
}

function assert(cond, msg){ if(!cond) throw new Error(msg); }

const proc = spawn('node', ['server.js'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test',
    BACKEND_TOKEN: 'test-token',
    REQUIRE_BACKEND_TOKEN: 'false',
    WAITLIST_REQUIRE_AUTH: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

proc.stdout.on('data', d => process.stdout.write(String(d)));
proc.stderr.on('data', d => process.stderr.write(String(d)));

try {
  await waitForHealth();

  const health = await fetch(`${base}/api/health`);
  assert(health.ok, 'health should be 200');

  const ready = await fetch(`${base}/api/ready`);
  assert(ready.status === 503, 'ready should be 503 in test env without provider keys');

  const waitlistGood = await fetch(`${base}/api/waitlist`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email:'test@example.com', source:'smoke' })
  });
  assert(waitlistGood.ok, 'waitlist should accept public signup when WAITLIST_REQUIRE_AUTH=false');


  const waitlistDup = await fetch(`${base}/api/waitlist`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email:'test@example.com', source:'smoke' })
  });
  const waitlistDupJson = await waitlistDup.json();
  assert(waitlistDup.ok && waitlistDupJson.existed === true, 'duplicate waitlist signup should be marked existed=true');

  const waitlistBad = await fetch(`${base}/api/waitlist`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email:'bad-email' })
  });
  assert(waitlistBad.status === 400, 'waitlist should reject invalid email');

  const scrapeNoAuth = await fetch(`${base}/api/reviews/scrape`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ asin:'B09WB35WBH' })
  });
  assert(scrapeNoAuth.status === 401, 'scrape should require auth when BACKEND_TOKEN is set');

  console.log('smoke test passed');
} finally {
  proc.kill('SIGTERM');
}
