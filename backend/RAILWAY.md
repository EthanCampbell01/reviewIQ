# Railway deployment (ReviewIQ backend)

## 1) Deploy this folder as a service
- Root directory: `backend`
- Start command: `npm start`

## 2) Configure environment variables
Copy from `.env.example`.

### Required
- `ANTHROPIC_API_KEY`
- `SCRAPINGDOG_API_KEY`

### Security hardening (recommended)
- `BACKEND_TOKEN`
- `CORS_ORIGINS=https://landing.yourdomain.com,https://app.yourdomain.com`
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=90`
- `REQUIRE_BACKEND_TOKEN=true`
- `WAITLIST_REQUIRE_AUTH=false` (recommended for public landing-page signup)
- `EXTERNAL_TIMEOUT_MS=25000`
- `EXTERNAL_RETRIES=1`

### Billing
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_GROWTH`
- `STRIPE_PRICE_SCALE`
- `APP_BASE_URL=https://app.yourdomain.com`

### Waitlist persistence options
- **Default**: file-backed (`backend/data/waitlist.json`) for single-instance setups.
- **Preferred**: Supabase REST persistence:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_TABLE=waitlist_signups`

## 3) Readiness checks
- `GET /api/health` → service + readiness snapshot
- `GET /api/ready` → returns 200 if core production readiness checks pass
- In production, service now hard-fails startup when `BACKEND_TOKEN` is missing and `REQUIRE_BACKEND_TOKEN=true`.

## 4) Frontend wiring
In `reviewiq-app.html` Settings page:
- **Backend API Base URL** → `https://<your-service>.up.railway.app`
- **Backend API Token** → same as `BACKEND_TOKEN` (if set)

Landing page waitlist capture:
```html
<script>
  window.REVIEWIQ_API_BASE = 'https://<your-service>.up.railway.app';
</script>
```

## 5) Endpoints provided
- `GET /api/health`
- `GET /api/ready`
- `POST /api/waitlist`
- `POST /api/reviews/scrape`
- `POST /api/reviews/analyze`
- `POST /api/copy/generate`
- `POST /api/billing/create-checkout-session`
