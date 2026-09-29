<p align="center">
  <img src="apps/web/public/icon.svg" alt="Tallyo logo" width="88" height="88" />
</p>

<h1 align="center">Tallyo</h1>

<p align="center"><b>Snap a receipt. Tallyo does the rest.</b><br/>
AI expense tracker for Europe — scan receipts, catch mistakes, split bills fairly. GDPR-first, EU-hosted.</p>

---

## Why Tallyo?

Receipts are small, but the hassle isn't:

- **Paper piles up** — receipts fade, get lost, or end up in a shoebox until tax time.
- **Typing is tedious** — copying merchant, date, VAT and every item into a spreadsheet is slow and error-prone.
- **Splitting is awkward** — after a dinner, a trip or a month of shared groceries, working out who owes whom is easy to get wrong.

Tallyo turns a photo into clean, checked, shareable expense data in seconds.

## Features

| | |
|---|---|
| 📸 **Scan** | Photograph or upload a receipt or bill. Location data (EXIF/GPS) is stripped automatically. |
| 🤖 **AI extraction** | Merchant, date, total, VAT, currency and every line item — understands European formats (`12,50 €`, `MwSt`, `TVA`, `IVA`, `BTW`). |
| ⚠️ **Doubtful-field flagging** | Every value is re-checked in code: items vs. total, VAT above the EU maximum (27 %), impossible dates, low confidence, unreadable images. Suspicious fields are highlighted for one-tap correction; every correction is logged. |
| 🤝 **Bill splitting** | Split equally, by item or with custom amounts. Tax and tips are shared pro rata, and shares always add up to the cent. Balances show who owes whom, with the fewest transfers to settle up. |
| 🏦 **Bank matching** *(optional)* | Read-only PSD2 connection via Enable Banking. Card payments are matched to receipts, and payments without a receipt are highlighted. |
| 💬 **Assistant** | Ask about your spending, fix flagged receipts, split bills or settle up in plain language. Always asks before changing anything, and only answers questions about Tallyo and your expenses. |
| 🔒 **Privacy centre** | Manage consents, download all your data (JSON), or delete your account and everything in it — self-service. |
| 📱 **Android app** | Capacitor shell with camera access; the APK is built by GitHub Actions. |

## How it works

```
Photo ──► Next.js (SSR) ──► OCR service ──► Groq Llama 4 Scout (reads the image)
                                  │
                                  ▼
                   Deterministic validation (our code decides)
                                  │
               ┌──────────────────┴──────────────────┐
               ▼                                     ▼
        ✓ Ready                              ⚠ Needs review
                                   (flagged fields highlighted for correction)
```

**The AI extracts; our code decides.** The model never has the final word on arithmetic: totals, VAT and dates are recomputed and validated deterministically.

## Architecture

```
 Phone (APK) / Browser
        │  HTTPS — session cookie only, no business logic in the client
        ▼
 ┌──────────────────────────────┐   Vercel · fra1 (Frankfurt)
 │ apps/web — Next.js 16 (SSR)  │   Server Components + Server Actions
 │ UI + API gateway             │   signs 60 s HMAC service tokens
 └───────┬──────────┬─────────┬─┘
         ▼          ▼         ▼            Fly.io · fra (Frankfurt)
     ┌───────┐ ┌────────┐ ┌─────────┐
     │  ocr  │ │ ledger │ │ chatbot │
     └───┬───┘ └───┬────┘ └────┬────┘
         │ Groq    │ Enable    │ Groq Llama 3.3 70B
         │ vision  │ Banking   │ (tool calling + topic guard)
         ▼         ▼           ▼
 ┌────────────────────────────────────────────┐  Supabase · eu-central-1
 │ Postgres (RLS on every table) + Storage     │
 └────────────────────────────────────────────┘
```

| Service | Responsibility |
|---|---|
| `apps/web` | Server-rendered UI, auth, input validation, API gateway |
| `services/ocr` | Image normalisation, AI extraction, flagging, corrections |
| `services/ledger` | Splits, balances, groups, bank sync & matching, GDPR erasure |
| `services/chatbot` | AI assistant with tool access to every feature |
| `packages/shared` | Zod schemas, validation, split maths (integer cents), matching, service tokens |
| `packages/service-kit` | Fastify bootstrap: auth, rate limiting, security headers, DB client |

### Tech stack

- **Frontend / gateway:** Next.js 16 (App Router, SSR, Server Actions), React 19, Tailwind CSS 4
- **Services:** Node.js 22, TypeScript, Fastify 5
- **Database / auth / storage:** Supabase (Postgres + Row-Level Security), EU Frankfurt
- **AI:** Groq — Llama 4 Scout (vision), Llama 3.3 70B (assistant)
- **Open banking:** Enable Banking (PSD2 AIS)
- **Mobile:** Capacitor 8 (Android)
- **Hosting:** Vercel (fra1) + Fly.io (fra)

## Project structure

```
apps/
  web/                 Next.js app (UI + gateway)
  mobile/              Capacitor Android shell
services/
  ocr/  ledger/  chatbot/
packages/
  shared/              schemas, validation, splits, matching
  service-kit/         shared Fastify setup
supabase/migrations/   database schema, RLS, GDPR functions
docs/                  architecture, development journey
.github/workflows/     CI + Android APK build
```

## Getting started

### Prerequisites

- Node.js 22+
- A Supabase project in **Central EU (Frankfurt)**
- A Groq API key
- *(optional)* An Enable Banking application for bank matching

### 1. Install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in `.env` (see the comments in `.env.example`), then copy it for the web app:

```bash
cp .env apps/web/.env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | Supabase → Project Settings → API (`https://<project>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API Keys → publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → secret key — **never commit or share** |
| `GROQ_API_KEY` | console.groq.com |
| `INTERNAL_SERVICE_SECRET` | generate: `openssl rand -base64 48` |

> `.env` and `.env.local` are git-ignored. Never commit real keys.

### 3. Database

In the Supabase **SQL Editor**, run in order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_gdpr.sql`

### 4. Run

```bash
npm run dev
```

| App | URL |
|---|---|
| Web | http://localhost:3000 |
| OCR service | http://localhost:4001 |
| Ledger service | http://localhost:4002 |
| Chatbot service | http://localhost:4003 |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app + all services with hot reload |
| `npm test` | Unit tests (validation, splits, matching, tokens, parsing, topic guard) |
| `npm run typecheck` | TypeScript checks for all packages |
| `npm run build` | Production builds |

## Deployment

1. **Supabase:** Frankfurt project, run the migrations, enable `pg_cron` and schedule `public.run_retention()`.
2. **Services (Fly.io):** for each of `ocr`, `ledger`, `chatbot`:
   ```bash
   fly launch --no-deploy --config services/<svc>/fly.toml
   fly secrets set ... --config services/<svc>/fly.toml
   fly deploy --config services/<svc>/fly.toml
   ```
3. **Web (Vercel):** import the repo with root directory `apps/web`; the region is pinned to `fra1` by `vercel.json`. Add the env vars, including `OCR_SERVICE_URL`, `LEDGER_SERVICE_URL` and `CHATBOT_SERVICE_URL`.
4. **Groq:** enable Zero Data Retention and sign the DPA.
5. **Enable Banking:** register the app and set the redirect URL to `https://<your-domain>/bank/callback`.

## Android APK

GitHub → **Actions → Build Android APK → Run workflow** → enter your deployed URL → download the `receipt-scanner-apk` artifact.

Locally (JDK 21 + Android SDK):

```bash
cd apps/mobile && npm install && npx cap add android
APP_URL=https://your-domain npm run apk:debug
```

## Privacy & security

| | |
|---|---|
| **EU data residency** | Database, storage and servers in Frankfurt |
| **Access control** | Row-Level Security on every table; services verify short-lived, audience-bound HMAC tokens |
| **GDPR rights** | Self-service data export (Art. 15/20), correction (Art. 16), erasure (Art. 17) |
| **Consent** | Versioned, recorded consents; AI processing and bank access are opt-in |
| **Retention** | Chat history 30 days; raw AI output 1 year; expired bank consents closed automatically |
| **Minimisation** | EXIF stripped, no data about non-users, bank data deleted on revoke |
| **Web security** | Strict CSP, HSTS, frame-deny, no third-party scripts or trackers |
| **AI safety** | Assistant limited to Tallyo topics; confirmation before any change; tool output treated as untrusted |

The privacy notice in the app is a **template** and must be reviewed by a lawyer or DPO before launch.

## Documentation

- [`docs/architecture.md`](docs/architecture.md): design, data flow, security and GDPR mapping
- [`docs/journey.md`](docs/journey.md): development log and every approved decision

## Status

Early development (v0.1). See the *Next steps* section in `docs/journey.md` for the roadmap.

## License

No license has been chosen yet — all rights reserved by the author.
