# MP Cargo Ops — Container Tracker

Next.js app powered by Claude API. Runs daily at 7am, scans Gmail for CMA-CGM arrival notices and release reminders, generates email drafts, and provides a live dashboard for the whole team.

---

## What it does

- **Daily cron (7am)** — scans mpcargolille@gmail.com for arrival notices and release threads
- **Claude API** — reads raw emails, extracts container data, drafts Instruction Douane emails and release reminders
- **Draft review UI** — review, edit, approve or reject drafts before they're sent
- **Live dashboard** — container tracker with ETA countdown, release status, NOA status
- **Push notifications** — email alert when critical items are found
- **Manual trigger** — run the task on demand from the dashboard

---

## Setup — Step by Step

### 1. Clone and install

```bash
git clone <your-repo>
cd mp-cargo-ops
npm install
```

### 2. Google Cloud — Gmail API credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `mp-cargo-ops`)
3. Enable **Gmail API** (APIs & Services → Enable APIs → search "Gmail API")
4. Go to **Credentials** → Create Credentials → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/api/gmail` (dev) + `https://your-app.vercel.app/api/gmail` (prod)
5. Download the credentials — you'll get `client_id` and `client_secret`

### 3. Get the Gmail refresh token

```bash
# Copy .env.example to .env.local
cp .env.example .env.local

# Fill in GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET, then run:
npm run dev

# Open in browser:
http://localhost:3000/api/gmail

# This redirects to Google OAuth. Log in as mpcargolille@gmail.com.
# After auth, the page shows your refresh_token — copy it to .env.local as GMAIL_REFRESH_TOKEN
# The refresh token only appears ONCE. Save it immediately.
```

### 4. Fill in .env.local

```env
ANTHROPIC_API_KEY=sk-ant-...           # From console.anthropic.com
GMAIL_CLIENT_ID=...                    # From step 2
GMAIL_CLIENT_SECRET=...               # From step 2
GMAIL_REFRESH_TOKEN=...               # From step 3
GMAIL_USER=mpcargolille@gmail.com

RESEND_API_KEY=re_...                  # From resend.com (free tier is fine)
NOTIFICATION_EMAIL=devanshi@manilal.com

CRON_SECRET=pick-a-random-string       # e.g. run: openssl rand -hex 16
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

To test the task locally:
```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-cron-secret"}'
```

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/your-org/mp-cargo-ops
git push -u origin main
```

### 2. Create Vercel project

1. Go to [vercel.com](https://vercel.com) → New Project → import from GitHub
2. Framework preset: **Next.js** (auto-detected)

### 3. Add Vercel KV (Redis)

1. In your Vercel project → **Storage** tab → **Create KV Store**
2. Name it `mp-cargo-kv`
3. Connect it to your project — Vercel auto-injects the KV env vars

### 4. Add environment variables in Vercel

Go to Project Settings → Environment Variables and add all values from your `.env.local`.

Update `NEXT_PUBLIC_APP_URL` to your Vercel URL (e.g. `https://mp-cargo-ops.vercel.app`).

### 5. Update Gmail OAuth redirect URI

Go back to Google Cloud Console → Credentials → your OAuth client → add:
```
https://mp-cargo-ops.vercel.app/api/gmail
```

Then re-run the OAuth flow on your deployed URL to get a fresh refresh token if needed.

### 6. Deploy

```bash
git push origin main
# Vercel auto-deploys on push
```

### 7. Verify the cron

In Vercel dashboard → your project → **Cron Jobs** tab.
You should see one job: `GET /api/cron` at `0 5 * * 1-5` (7am Paris time = 5am UTC, Mon-Fri).

To trigger manually from the dashboard, click **Run Now** and enter your `CRON_SECRET`.

---

## Set up Resend for notifications

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month)
2. Add your sending domain or use the sandbox
3. Copy your API key to `RESEND_API_KEY`
4. Set `NOTIFICATION_EMAIL` to whoever should receive the daily critical alerts

---

## Access for team members

Anyone with the Vercel URL can open the dashboard — no login required by default.

To add basic password protection (recommended for internal tools):
- Vercel Pro: use **Password Protection** in project settings (one click)
- Free: add a simple middleware check in `middleware.ts`

---

## Project structure

```
app/
  page.tsx              → Main dashboard (Summary / Containers / NOA tabs)
  drafts/page.tsx       → Draft review UI
  api/
    cron/route.ts       → Vercel cron endpoint (7am daily)
    run/route.ts        → Manual trigger endpoint
    state/route.ts      → Returns current app state (containers + drafts)
    drafts/route.ts     → Approve / reject / edit drafts
    gmail/route.ts      → Gmail OAuth callback
lib/
  gmail.ts              → Gmail API wrapper (search, fetch, create drafts)
  claude.ts             → Claude API (detect NOAs, analyze releases, generate drafts)
  task.ts               → Core task logic (orchestrates gmail + claude)
  store.ts              → Vercel KV state management
  notify.ts             → Email notifications via Resend
components/
  ContainerTable.tsx    → Sortable/filterable container table
  ActionItems.tsx       → Prioritized action items panel
  StatusKPIs.tsx        → KPI cards (critical / check / upcoming / resolved)
  RunStatus.tsx         → Last run status bar
types/
  index.ts              → All TypeScript types
```

---

## Cron schedule

The cron runs at `0 5 * * 1-5` = 5am UTC = 7am Paris time, Monday to Friday.

To change the schedule, edit `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron", "schedule": "0 5 * * 1-5" }] }
```

Note: Vercel cron requires a **Pro plan** for schedules more frequent than daily.
For the daily 7am use case, the **Hobby plan** works fine.

---

## Costs (estimate)

| Service | Usage | Cost |
|---|---|---|
| Vercel (Hobby) | Hosting + cron | Free |
| Vercel KV | < 100MB storage | Free |
| Anthropic API | ~5 Claude calls/day | ~$0.05/day |
| Resend | 1 email/day | Free |
| Google Cloud | Gmail API | Free |
| **Total** | | **~$1.50/month** |
