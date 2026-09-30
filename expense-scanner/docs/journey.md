# Development journey

A running log of what was built and why. Every stack decision was approved by the project owner.

## 2026-09-29 — Session 1: foundations

### Decisions (approved)
| # | Topic | Choice | Why |
|---|---|---|---|
| 1 | OCR model | Groq **Llama 4 Scout** | Llama 3.2 Vision (in the original notes) is deprecated by Groq |
| 2 | Open banking | **Enable Banking** | GoCardless Bank Account Data closed new signups |
| 3 | Architecture | Next.js SSR gateway + **3 services** (OCR, Ledger, Chatbot) | Real microservices without heavy ops; split further later |
| 4 | APK | **Capacitor** Android shell | One codebase, native camera, logic stays on server |
| 5 | Service language | **TypeScript / Node (Fastify)** | One language, shared types |
| 6 | Hosting | **Vercel fra1 + Fly.io fra** | EU regions, easy deploys |
| 7 | Chatbot LLM | Groq **Llama 3.3 70B** | Tool calling, fast, same provider |

Not a separate decision: Next.js 16 (the current major version) was used instead of 14/15. It's the same framework; the only visible change is that `middleware.ts` is now called `proxy.ts`.

### Built
- Monorepo (npm workspaces), shared package with 15 unit tests + OCR parser tests
- Supabase schema: profiles, consents, groups, receipts, items, corrections, splits, bank connections/transactions, chat, audit; RLS on all tables; GDPR export / retention / erasure helpers
- OCR service: image normalisation, Groq extraction, locale-aware number parsing, deterministic flagging, corrections
- Ledger service: equal / by-item / custom splits, balances + debt simplification, groups, Enable Banking connect/sync/revoke, receipt ↔ transaction matching, account erasure
- Chatbot service: 10 tools covering every feature, with confirmation before any change
- Web: login/signup with consent, dashboard, scan, receipts, review & correct, splits, bank, assistant, privacy centre, privacy notice; security headers
- Deploy: Dockerfile, fly.toml ×3, vercel.json, docker-compose, CI + APK GitHub Actions

### Verified
- `npm test` passes; `tsc` is clean for all packages; `next build` succeeds; services bundle and start
- A service rejects unsigned calls (401) and bad input (400)

## 2026-09-29 — Session 1b: local setup + landing page

### Local setup fixes
- Services now load the root `.env` (`tsx watch --env-file-if-exists=../../.env`)
- The root `npm run dev` uses `concurrently`, so the web app and all 3 services run together
- CSP: `'unsafe-eval'` and `ws:` are allowed **in development only** (React dev tooling and hot reload); production stays strict
- Security incident: a Supabase secret key was pasted in chat, and the owner was told to rotate it

### Decisions (approved)
| # | Topic | Choice |
|---|---|---|
| 8 | Product name | **Tallyo** (still to check on EUIPO and domain availability) |
| 9 | Education page | Public landing page at `/`; signed-in users are redirected to `/dashboard` |
| 10 | Languages | English only for now |

### Built
- `lib/brand.ts`: the single place for the product name, used across the layout, login, privacy notice, manifest and Capacitor app
- Landing page sections: hero with a receipt → extracted-data illustration, problem, how it works (4 steps), where AI helps (reading, catching mistakes, fair splits, assistant, bank matching, privacy), who it's for, privacy by design, FAQ, final call to action
- No fake testimonials or statistics; the examples are clearly illustrative
- Verified: `next build` passes, and screenshots at 1280 px and 390 px show no horizontal scrolling

### Next steps
1. Run the SQL migrations in Supabase, sign up, and test a real receipt
2. Deploy (Vercel + Fly.io) and build the APK
3. Legal review of the privacy notice; DPIA; records of processing

## 2026-09-30 — Session 3: models, hosting and fixes

### Decisions (approved)
| # | Topic | Choice | Why |
|---|---|---|---|
| 11 | Services hosting | **Render, Frankfurt, free plan** (`render.yaml`), replacing Fly.io | Free tier in the EU. Trade-off: services sleep after ~15 min, so the first request takes 30–60 s |
| 12 | AI models | **Qwen 3.8** (vision), **GPT-OSS 120B** (assistant), **GPT-OSS 20B** (topic guard) | Groq retired Llama 4 Scout and removed Llama 3.3 70B from the free plan |

### Built / fixed
- Mobile: collapsible menu, camera fixed in the Android app (`image/*` + CAMERA permission + `IMAGE_CAPTURE` query), gallery picker, toast messages
- Assistant restricted to product topics (guard model + system prompt); clear errors for a missing service, a rejected key or a retired model
- `npm run check` / `predev`: validates `.env`, Groq key and models, Supabase keys and tables, and running services
- OCR: tolerant field-by-field parsing, reasoning disabled for speed, 60 s model timeout, raw model answer logged on localhost
- `supabase/setup.sql`: one-time setup (migrations, grants for signed-in users, profile backfill, schema reload)
- Saving a receipt with no remaining flags returns to the receipts list
- Localhost shows real error causes; production (`NODE_ENV=production`) stays generic
- Sample receipts in `test-receipts/` for end-to-end testing

### Next steps
1. Deploy the three services on Render and set their URLs in Vercel
2. Rebuild the APK against the live URL
3. Legal review of the privacy notice; DPIA; records of processing

