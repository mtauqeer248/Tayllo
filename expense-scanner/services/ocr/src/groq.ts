import { env } from '@es/service-kit';
import { ExtractedReceiptSchema, type ExtractedReceipt } from '@es/shared';
import { RECEIPT_SYSTEM_PROMPT } from './prompt';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Send the image to Groq's vision model (Qwen 3.8) and parse a strict JSON extraction.
 * The image is sent inline (base64) — Groq does not retain it (zero data retention
 * must be enabled in the Groq console for GDPR).
 */
export async function extractWithGroq(jpegBase64: string, signal?: AbortSignal): Promise<ExtractedReceipt> {
  const body: Record<string, unknown> = {
    model: env('GROQ_VISION_MODEL', 'qwen/qwen3.8-27b'),
    temperature: 0,
    max_completion_tokens: 4096,
    response_format: { type: 'json_object' },
    reasoning_format: 'hidden', // Qwen can "think" first; keep only the JSON answer
    messages: [
      { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract this receipt.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
        ],
      },
    ],
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      // Older/other models may not accept reasoning_format — retry once without it.
      if (res.status === 400 && 'reasoning_format' in body && /reasoning/i.test(text)) {
        delete body.reasoning_format;
        continue;
      }
      let detail = text.slice(0, 200);
      try { detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail; } catch { /* raw */ }
      throw new Error(`Groq error ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices[0]?.message.content ?? '{}';
    return parseExtraction(content);
  }
  throw lastErr ?? new Error('Groq failed');
}

/** Tolerant parsing: coerce "12,50" strings into numbers, then validate with zod. */
export function parseExtraction(content: string): ExtractedReceipt {
  let raw: unknown;
  // strip any <think>…</think> block and text around the JSON object
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
  try {
    raw = JSON.parse(json);
  } catch {
    return ExtractedReceiptSchema.parse({ merchant_name: null, date: null, vat_amount: null, total_amount: null, unreadable: true });
  }
  const fixed = coerceNumbers(raw);
  const parsed = ExtractedReceiptSchema.safeParse(fixed);
  if (parsed.success) return parsed.data;
  return ExtractedReceiptSchema.parse({ merchant_name: null, date: null, vat_amount: null, total_amount: null, unreadable: true });
}

const NUMERIC_KEYS = new Set(['subtotal_amount', 'vat_amount', 'total_amount', 'quantity', 'unit_price', 'price', 'vat_rate']);
function coerceNumbers(v: unknown, key?: string): unknown {
  if (Array.isArray(v)) return v.map((x) => coerceNumbers(x));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, coerceNumbers(x, k)]));
  }
  if (key && NUMERIC_KEYS.has(key) && typeof v === 'string') {
    return parseLocaleNumber(v);
  }
  if (key === 'currency' && typeof v === 'string') return v.toUpperCase().slice(0, 3);
  return v;
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
