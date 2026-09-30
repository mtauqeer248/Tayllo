import { env } from '@es/service-kit';
import { ExtractedItemSchema, ExtractedReceiptSchema, type ExtractedReceipt } from '@es/shared';
import { RECEIPT_SYSTEM_PROMPT } from './prompt';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEV = process.env.NODE_ENV !== 'production';

/**
 * Send the image to Groq's vision model (Qwen 3.8) and parse a JSON extraction.
 * The image is sent inline (base64) — Groq does not retain it (zero data retention
 * must be enabled in the Groq console for GDPR).
 */
export async function extractWithGroq(jpegBase64: string, signal?: AbortSignal): Promise<ExtractedReceipt> {
  const body: Record<string, unknown> = {
    model: env('GROQ_VISION_MODEL', 'qwen/qwen3.8-27b'),
    temperature: 0,
    // Qwen may "think" first and thinking counts toward this limit — leave plenty of room.
    max_completion_tokens: 8192,
    response_format: { type: 'json_object' },
    reasoning_effort: 'none', // reading a receipt needs no long reasoning: faster, and no token exhaustion
    reasoning_format: 'hidden', // if it does think, return only the answer
    messages: [
      { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract this receipt. Answer with the JSON object only.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
        ],
      },
    ],
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env('GROQ_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Groq ${res.status}`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      // Not every model accepts the reasoning options — drop the one it complains about and retry.
      if (res.status === 400 && /reasoning/i.test(text)) {
        if ('reasoning_effort' in body) { delete body.reasoning_effort; continue; }
        if ('reasoning_format' in body) { delete body.reasoning_format; continue; }
      }
      let detail = text.slice(0, 200);
      try { detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail; } catch { /* raw */ }
      throw new Error(`Groq error ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as { choices: { message: { content: string | null }; finish_reason?: string }[] };
    const choice = json.choices[0];
    const content = choice?.message.content ?? '';
    const result = parseExtraction(content);
    if (DEV && (result.unreadable || result.total_amount == null || !result.merchant_name)) {
      // Development only: show what the model actually answered so parsing problems are visible.
      console.warn(`[ocr] model answer (finish_reason=${choice?.finish_reason}):\n${content.slice(0, 1500) || '(empty)'}`);
    }
    return result;
  }
  throw lastErr ?? new Error('Groq failed');
}

const UNREADABLE = { merchant_name: null, date: null, vat_amount: null, total_amount: null, unreadable: true };

/**
 * Tolerant parsing. Models differ in small ways (wrapper objects, alternative key names,
 * "12,50" strings, 28.09.2026 dates, confidence as text), so each field is salvaged on
 * its own — one odd field never throws away the whole receipt.
 */
export function parseExtraction(content: string): ExtractedReceipt {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const text = cleaned.match(/\{[\s\S]*\}/)?.[0];
  if (!text) return ExtractedReceiptSchema.parse(UNREADABLE);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return ExtractedReceiptSchema.parse(UNREADABLE);
  }
  const o = unwrap(raw);
  if (!o) return ExtractedReceiptSchema.parse(UNREADABLE);

  const pick = (...keys: string[]) => {
    for (const k of keys) if (o[k] !== undefined && o[k] !== '') return o[k];
    return null;
  };
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? parseLocaleNumber(v) : null);

  const currency = str(pick('currency', 'currency_code'), 10)?.replace(/[^A-Za-z€]/g, '').toUpperCase();
  const country = str(pick('country_code', 'country'), 10)?.toUpperCase();

  const itemsRaw = pick('items', 'line_items', 'lines');
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.flatMap((it) => {
        if (!it || typeof it !== 'object') return [];
        const i = it as Record<string, unknown>;
        const parsed = ExtractedItemSchema.safeParse({
          description: str(i.description ?? i.name ?? i.item, 200),
          quantity: num(i.quantity ?? i.qty) ?? 1,
          unit_price: num(i.unit_price),
          price: num(i.price ?? i.total ?? i.amount ?? i.line_total),
          vat_rate: num(i.vat_rate ?? i.tax_rate),
        });
        return parsed.success ? [parsed.data] : [];
      })
    : [];

  const confRaw = (pick('confidence') ?? {}) as Record<string, unknown>;
  const confidence: Record<string, number> = {};
  for (const k of ['merchant_name', 'date', 'total_amount', 'vat_amount']) {
    let c = num(confRaw[k]);
    if (c != null && c > 1 && c <= 100) c = c / 100; // "95" -> 0.95
    if (c != null && c >= 0 && c <= 1) confidence[k] = c;
  }

  const total = num(pick('total_amount', 'total', 'grand_total', 'amount_paid', 'total_gross'));
  const vat = num(pick('vat_amount', 'vat', 'tax_amount', 'tax', 'vat_total'));
  const merchant = str(pick('merchant_name', 'merchant', 'store_name', 'store', 'vendor', 'shop_name'), 200);

  return ExtractedReceiptSchema.parse({
    merchant_name: merchant,
    merchant_vat_id: str(pick('merchant_vat_id', 'vat_id', 'vat_number', 'tax_id'), 40),
    country_code: country && /^[A-Z]{2}$/.test(country) ? country : null,
    currency: currency === '€' || currency === 'EURO' ? 'EUR' : currency && /^[A-Z]{3}$/.test(currency) ? currency : 'EUR',
    date: toIsoDate(pick('date', 'receipt_date', 'transaction_date', 'purchase_date')),
    subtotal_amount: num(pick('subtotal_amount', 'subtotal', 'net_amount')),
    vat_amount: vat,
    total_amount: total,
    items,
    confidence,
    // Only "unreadable" when the model says so AND nothing useful came back.
    unreadable: pick('unreadable') === true && total == null && !merchant,
  });
}

/** Accept {"receipt": {...}} / {"data": {...}} wrappers as well as the plain object. */
function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const known = ['merchant_name', 'merchant', 'total_amount', 'total', 'items', 'date'];
  if (known.some((k) => k in o)) return o;
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && known.some((k) => k in (v as object))) return v as Record<string, unknown>;
  }
  return o;
}

/** "2026-09-28" | "28.09.2026" | "28/09/2026" | "28-09-26" -> "2026-09-28" (European day-first). */
export function toIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const p2 = (x: string | undefined) => (x ?? '').padStart(2, '0');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3]?.length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${p2(m[2])}-${p2(m[1])}`;
  }
  return null;
}

/** "1.234,50" | "1,234.50" | "12,5" | "€ 3.99" -> number. The last separator is the decimal one. */
export function parseLocaleNumber(input: string): number | null {
  let s = input.replace(/[^\d,.-]/g, '');
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (lastSep >= 0) {
    // Amounts on receipts always have 1-2 decimals, so the last separator is the decimal mark.
    const intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
    s = `${intPart}.${s.slice(lastSep + 1)}`;
  }
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}
