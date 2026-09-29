# Receipt Scanner — AI expense tracker for the EU

Scan receipts → AI extracts the data → doubtful fields are flagged for correction → split bills with groups → match against bank transactions (PSD2) → ask the assistant anything. GDPR-first, EU-hosted, server-rendered, microservices.

```
apps/web          Next.js 16 (App Router, SSR, Server Actions) — UI + API gateway   → Vercel fra1
services/ocr      Groq Llama 4 Scout vision extraction + deterministic flagging     → Fly.io fra
services/ledger   Splits, balances, groups, bank sync (Enable Banking), GDPR erase  → Fly.io fra
services/chatbot  Groq Llama 3.3 70B assistant with tool access to every feature    → Fly.io fra
packages/shared   Zod schemas, validation, split maths, matching, service tokens
packages/service-kit  Fastify bootstrap: auth, rate limit, helmet, Supabase client
apps/mobile       Capacitor Android shell → APK
supabase/migrations  Postgres schema, RLS, GDPR functions
```

## Quick start

```bash
cp .env.example .env               # fill in keys
npx supabase start                 # or create an EU (Frankfurt) project and run migrations
npx supabase db push               # applies supabase/migrations
npm install
npm test                           # unit tests: validation, splits, matching, tokens, parsing
npm run dev                        # web :3000, ocr :4001, ledger :4002, chatbot :4003
```

`INTERNAL_SERVICE_SECRET`: `openssl rand -base64 48`. Copy the same `.env` values to `apps/web/.env.local`.

## Deploy

1. **Supabase**: create a project in **eu-central-1 (Frankfurt)**, run the migrations, enable `pg_cron` and schedule `public.run_retention()` (see `0002_gdpr.sql`).
2. **Services**: `fly launch --no-deploy --config services/<svc>/fly.toml`, then `fly secrets set ...` and `fly deploy --config services/<svc>/fly.toml` for `ocr`, `ledger`, `chatbot`.
3. **Web**: import the repo into Vercel with root `apps/web`; region is pinned to `fra1` by `vercel.json`. Set env vars incl. the three `*_SERVICE_URL`s.
4. **Groq**: enable Zero Data Retention in the console and sign the DPA.
5. **Enable Banking**: register an application, upload the public key, set redirect URL `https://<web>/bank/callback`.

## Android APK

GitHub → Actions → **Build Android APK** → enter your deployed URL → download the `receipt-scanner-apk` artifact.
Locally (needs JDK 21 + Android SDK): `cd apps/mobile && npm i && npx cap add android && APP_URL=https://... npm run apk:debug`.

See `docs/journey.md` for all decisions and `docs/architecture.md` for the design.
