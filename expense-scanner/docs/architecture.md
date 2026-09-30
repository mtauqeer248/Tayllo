# Architecture

```
 Phone (Capacitor APK) / Browser
            │ HTTPS (only a session cookie, no business logic in the client)
            ▼
 ┌─────────────────────────────┐   Vercel fra1
 │ apps/web  Next.js SSR       │  Server Components + Server Actions
 │  • Supabase auth (cookie)   │  • validates input (zod, magic bytes)
 │  • API gateway              │  • signs 60 s HMAC service token {sub:userId, aud}
 └──────┬─────────┬──────────┬─┘
        │         │          │
        ▼         ▼          ▼            Render (Frankfurt)
   ┌────────┐ ┌────────┐ ┌─────────┐
   │  ocr   │ │ ledger │ │ chatbot │──── calls ocr/ledger with the same user's token
   └───┬────┘ └───┬────┘ └────┬────┘
       │          │           │
       │ Groq     │ Enable    │ Groq GPT-OSS 120B (tool calling)
       │ Qwen 3.8 │ Banking   │
       │ (vision) │ (PSD2)    │
       ▼          ▼           ▼
 ┌──────────────────────────────────────┐  Supabase eu-central-1
 │ Postgres (RLS on every table) + Storage (private bucket) │
 └──────────────────────────────────────┘
```

## Receipt flow
1. User uploads a photo → Server Action checks size + magic bytes + `ai_processing` consent.
2. Image stored at `receipts/<userId>/<receiptId>.jpg` (private bucket, RLS by folder).
3. Gateway calls `ocr /process`. OCR service strips EXIF (GPS), resizes, sends to Groq Qwen 3.8 (qwen/qwen3.8-27b) in JSON mode.
4. **The model only extracts; our code decides.** `validateReceipt()` recomputes every check:
   missing fields, low confidence (< 0.7), items ≠ total (± 2 cents / 0.5 %, gross or net + VAT),
   VAT ≥ total, VAT rate > 27 % (EU max), invalid/future date, unknown currency, unreadable image.
5. Flags are stored per field → UI highlights those inputs → user corrects → `ocr /correct`
   logs old/new values in `receipt_corrections` and re-validates.

## Splits
Integer cents only. Largest-remainder allocation guarantees shares sum exactly to the total.
Modes: equal, by item (tax/tip/discount distributed pro rata), custom (must sum to total).
Balances are netted per person; `simplifyDebts` suggests the minimum transfers.

## Security
- Services reject any call without a valid, unexpired, audience-bound HMAC token (timing-safe compare).
- Service role key lives only in services; every query is additionally filtered by `user_id`.
- Rate limiting per user (120/min), helmet headers, body limits, redacted logs (no PII in logs).
- Web: strict CSP, HSTS, frame-deny, no third-party scripts, generic auth errors (no account enumeration).
- Chatbot: write tools require an explicit `confirmed=true` after the user agrees; tool output treated as untrusted data; navigation targets allow-listed.

## GDPR
| Requirement | Implementation |
|---|---|
| EU residency | Supabase Frankfurt, Vercel fra1, Render Frankfurt, Enable Banking (FI) |
| Lawful basis & consent | `consents` table, versioned; AI + bank consent checked server-side |
| Art. 15/20 access & portability | `/api/export` → `export_my_data()` JSON |
| Art. 16 rectification | correction UI + `receipt_corrections` log |
| Art. 17 erasure | `ledger /gdpr/erase`: revoke bank sessions, delete files, anonymise audit, delete user (cascade) |
| Storage limitation | `run_retention()`: chat 30 d, raw model output 1 y, expired bank consents |
| Data minimisation | EXIF stripped, no invites to non-users, bank data deleted on revoke |
| Transfers | Groq (US): SCCs + zero data retention; disclosed in privacy notice |
