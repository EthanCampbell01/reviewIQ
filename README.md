# ReviewIQ 🔍⚡

> AI-powered competitor review intelligence for Amazon sellers.

**ReviewIQ** scrapes competitor Amazon product reviews, runs them through Claude AI, and delivers weekly intelligence reports — showing sellers exactly what buyers hate, what they love, and what listing copy will convert.

---

## What It Does

Paste a competitor's ASIN → ReviewIQ pulls every review → Claude AI clusters complaint themes → you get a structured report with:

- **Top 5 complaint themes** with % frequency (e.g. "Lid leaks — 68% of 1-star reviews")
- **Top praise themes** (what buyers love about the competitor)
- **AI-generated listing copy** using real buyer language
- **Competitor SWOT analysis**
- **6-week sentiment trend charts**

---

## Files

| File | Description |
|------|-------------|
| `reviewiq-app.html` | Full dashboard application — all pages, live analysis engine |
| `reviewiq-landing.html` | Marketing landing page with animated demo and email capture |
| `backend/server.js` | Express API for Railway/production proxy (scrape, analyze, copy, waitlist) |
| `backend/RAILWAY.md` | Step-by-step Railway deployment guide for the backend service |

---

## Pages in the App

- **Dashboard** — ASIN tracker table with sparkline trend charts, one-click report view
- **Reports** — All reports in collapsible accordion, CSV export
- **Compare ASINs** — Side-by-side competitor comparison with opportunity gap analysis
- **Copy Generator** — AI listing copywriter (bullets, titles, full descriptions) powered by Claude
- **Alerts** — Sentiment drop alerts, review spike detection, notification rules
- **Settings** — API key config, analysis preferences, data export

---

## Setup (2 steps)

### 1. Get API keys

| Key | Where to get it | Cost |
|-----|----------------|------|
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com) | ~$0.003/1K tokens |
| Scrapingdog | [scrapingdog.com](https://scrapingdog.com) | 1,000 free, $0.20/1K after |

### 2. Add keys to the app

Open `reviewiq-app.html` and find the `CFG` object near the top of the `<script>` tag:

```js
let CFG = {
  anthropicKey: 'sk-ant-your-key-here',
  scrapingKey:  'your-scrapingdog-key-here',
  scrapingEndpoint: 'https://api.scrapingdog.com/amazon/reviews',
  // ...
};
```

Save the file and open it in your browser. That's it — live analysis is now active.

---

## How It Works (Technical)

```
Amazon Product Page
      ↓
Scrapingdog API  (handles proxies, CAPTCHAs, anti-bot)
      ↓
Raw Reviews (JSON)
      ↓
Claude AI  (claude-sonnet-4-20250514)
  → Clusters themes by frequency
  → Scores sentiment
  → Generates listing copy in buyer language
  → Builds SWOT analysis
      ↓
Dashboard Report  (animated charts, CSV export)
```

**Cost per user per month (at scale):**
- Scraping: ~$1–2 (depending on ASIN count and review volume)
- Claude AI: ~$0.10 (only new reviews sent each week, not full history)
- Total infra cost: **~$2–3/user/month** at Growth tier

---

## Business Model

| Plan | Price | ASINs | Features |
|------|-------|-------|---------|
| Starter | $49/mo | 5 | Weekly reports, top themes, email digest |
| Growth | $99/mo | 20 | Daily monitoring, copy suggestions, Slack alerts |
| Pro/Agency | $199/mo | 100 | White-label PDFs, API access, multi-user |

See the [full business plan](./BUSINESS_PLAN.md) for revenue projections and go-to-market strategy.

---


## Railway Backend (Recommended for production)

A ready-to-deploy backend is included under `backend/` so API keys stay server-side and Stripe checkout can be created from the server.

### Quick start

```bash
cd backend
npm install
npm start
```

Then set in the app Settings:
- **Backend API Base URL** (`https://<your-railway-service>.up.railway.app`)
- **Backend API Token** (if you configured `BACKEND_TOKEN`)

The backend now exposes scrape/analyze/copy/waitlist plus Stripe checkout session creation endpoints.

Use [`backend/.env.example`](./backend/.env.example) as your variable template.

See full deploy steps in [`backend/RAILWAY.md`](./backend/RAILWAY.md).

## Demo Mode

Both files work out of the box without API keys — they run in **demo mode** with realistic sample data (3 pre-loaded competitors in the tumbler/drinkware niche). Add API keys in Settings to switch to live mode.

---

## Data & Privacy

- In demo mode, app settings/data are stored in browser localStorage
- In backend mode, provider keys are kept server-side and never exposed to browser clients; backend token can be provided per browser session
- Waitlist signups can persist to file storage or Supabase via backend configuration

---

## Stack

- **Frontend:** Vanilla HTML/CSS/JS (zero dependencies, zero build step)
- **AI:** Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Scraping:** Scrapingdog Amazon Reviews API
- **Storage:** Browser localStorage (demo) + backend file/Supabase persistence (production)
- **Fonts:** Syne + JetBrains Mono (Google Fonts)

---

## Roadmap

- [ ] Supabase backend (multi-device sync, team accounts)
- [ ] Stripe subscription billing
- [ ] Email digest system (weekly reports to inbox)
- [ ] Walmart + Etsy review scraping
- [ ] White-label PDF report generation
- [ ] Slack/webhook alert delivery
- [ ] REST API for agency integrations

---

## Deployment

Since it's a static HTML file, you can deploy instantly to:

- **GitHub Pages** — push this repo, enable Pages, done
- **Netlify** — drag and drop the folder
- **Vercel** — `vercel deploy`
- **Anywhere that serves static files**

---

## License

MIT — do what you want with it.

---

*Built with Claude AI · Part of the ReviewIQ SaaS project*
