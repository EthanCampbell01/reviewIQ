# Railway deployment (ReviewIQ backend)

## 1) Deploy this folder as a service
- Root directory: `backend`
- Start command: `npm start`

## 2) Set environment variables
- `ANTHROPIC_API_KEY=sk-ant-...`
- `SCRAPINGDOG_API_KEY=...`
- `BACKEND_TOKEN=...` (optional but recommended)

## 3) Test health endpoint
`GET https://<your-service>.up.railway.app/api/health`

## 4) Connect frontend settings
In `reviewiq-app.html` Settings page:
- **Backend API Base URL** → `https://<your-service>.up.railway.app`
- **Backend API Token** → same as `BACKEND_TOKEN` (if set)

For the landing page waitlist capture, define before `</body>`:
```html
<script>
  window.REVIEWIQ_API_BASE = 'https://<your-service>.up.railway.app';
</script>
```

## Endpoints provided
- `GET /api/health`
- `POST /api/waitlist`
- `POST /api/reviews/scrape`
- `POST /api/reviews/analyze`
- `POST /api/copy/generate`
