# Tallyo — AI expense tracker for the EU (developer guide)

Scan receipts → AI extracts the data → doubtful fields are flagged for correction → split bills with groups → match against bank transactions (PSD2) → ask the assistant anything. GDPR-first, EU-hosted, server-rendered, microservices.

Live: https://tayllo-web.vercel.app · Android: [Releases](https://github.com/mtauqeer248/Tayllo/releases)

```
apps/web             Next.js 16 (App Router, SSR, Server Actions) — UI + API gateway        → Vercel fra1
services/ocr         Groq qwen/qwen3.8-27b vision extraction + deterministic flagging        → Render Frankfurt
services/ledger      Splits, balances, groups, bank sync (Enable Banking), GDPR erase         → Render Frankfurt
services/chatbot     Groq openai/gpt-oss-120b assistant (tools) + gpt-oss-20b topic guard     → Render Frankfurt
packages/shared      Zod schemas, validation, split maths, matching, service tokens
packages/service-kit Fastify bootstrap: auth, rate limit, helmet, Supabase client, Groq key check
apps/mobile          Capacitor Android shell → APK
supabase/setup.sql   One-time database setup (migrations + grants + schema reload)
scripts/check-env.mjs  Checks .env, Groq key + models, Supabase keys + tables, running services
```

## Quick start (localhost)

1. **Supabase**: create a project in **eu-central-1 (Frankfurt)**. Open **SQL Editor**, paste all of `supabase/setup.sql` and run it once.
2. **Environment**:
   ```bash
   cp .env.example .env              # fill in the keys
   cp .env apps/web/.env.local       # the web app reads its own copy
   ```
   `INTERNAL_SERVICE_SECRET`: `openssl rand -base64 48`.
3. **Run**:
   ```bash
   npm install
   npm run check                     # validates keys, models, tables (runs automatically before dev)
   npm run dev                       # one command: web :3000, ocr :4001, ledger :4002, chatbot :4003
   npm test                          # unit tests: validation, splits, matching, tokens, parsing
   ```
4. **Try it**: sign up, allow *AI receipt reading* under **Settings → Privacy**, then scan the samples in `../test-receipts/` (one clean, one with a deliberate total mismatch that gets flagged).

On localhost, errors show their real cause (e.g. `Service error 500: …`, `[ocr] model answer …`). In production (`NODE_ENV=production`) users only see friendly messages.

### Troubleshooting

| Message | Fix |
|---|---|
| `connection refused` / `A service is not running` | A service crashed or never started. Stop everything, `lsof -ti :3000,:4001,:4002,:4003 \| xargs kill -9`, then `npm run dev` |
| `model … does not exist` | Groq retired the model. Set `GROQ_*_MODEL` in `.env` and `apps/web/.env.local`, and `unset` any old values in your terminal |
| `AI key rejected` | Create a new key at console.groq.com and update both env files |
| `Could not find the table … in the schema cache` | `supabase/setup.sql` hasn't run in the project your URL points to |

## AI models (Groq)

| Env var | Default | Used for |
|---|---|---|
| `GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` | Reading receipt images (JSON mode, reasoning off) |
| `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` | Assistant with tool calling |
| `GROQ_GUARD_MODEL` | `openai/gpt-oss-20b` | Keeps the assistant on product topics |

The OCR parser is tolerant: each field is salvaged on its own (alternative key names, `21,00`, `28.09.2026`, wrapped JSON), so one odd field never discards the receipt. Every model result is re-checked by deterministic rules (item sums, EU VAT ≤ 27%, dates, confidence).

Enable **Zero Data Retention** in the Groq console and sign the DPA (Groq is a US processor: SCCs).

## Deploy

1. **Supabase**: Frankfurt project, run `supabase/setup.sql`, enable `pg_cron` and schedule `public.run_retention()` (see `migrations/0002_gdpr.sql`).
2. **Services on Render** (free plan, Frankfurt): `render.yaml` at the repo root defines `tallyo-ocr`, `tallyo-ledger` and `tallyo-chatbot`.
   - **Blueprint**: Render → New → Blueprint → this repo (Render may ask for a card; the free plan isn't charged).
   - **Without a card**: New → Web Service three times with root `expense-scanner`, build `npm ci --include=dev --workspace @es/<svc> --include-workspace-root && npm run build --workspace @es/<svc>`, start `node services/<svc>/dist/server.js`, health check `/healthz`, same env vars as in `render.yaml`.
   - Free services sleep after ~15 min idle; the first request takes 30–60 s.
3. **Web on Vercel**: root directory `expense-scanner/apps/web`, framework Next.js, region `fra1` (`vercel.json`). Set the Supabase keys, `INTERNAL_SERVICE_SECRET` (identical to Render) and `OCR_SERVICE_URL`, `LEDGER_SERVICE_URL`, `CHATBOT_SERVICE_URL` (the Render URLs), then redeploy.
4. **Enable Banking**: register an application, upload the public key, set redirect URL `https://<web>/bank/callback`.

`services/*/fly.toml` are kept for anyone who prefers Fly.io.

## Android APK

GitHub → Actions → **Build Android APK** → enter the deployed URL. The workflow builds `tallyo.apk`, uploads it as the `tallyo-apk` artifact and publishes it on the Releases page.
Locally (JDK 21 + Android SDK): `cd apps/mobile && npm i && npx cap add android && APP_URL=https://... npm run apk:debug`.

See `docs/journey.md` for all decisions and `docs/architecture.md` for the design.
