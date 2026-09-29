import { ISO_CURRENCIES, type ExtractedReceipt, type FieldFlag } from './schemas';
import { toCents } from './money';

/**
 * Deterministic "doubtful field" detection. The LLM extracts; this code decides.
 * We never trust the model's own arithmetic — every check below is recomputed here.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
/** Highest EU standard VAT rate is 27% (HU); small headroom for rounding. */
export const MAX_VAT_RATE = 0.275;
/** Tolerance for item sum vs total: 2 cents or 0.5 %, whichever is larger. */
const tolerance = (totalCents: number) => Math.max(2, Math.round(Math.abs(totalCents) * 0.005));

export interface ValidationOptions {
  today?: Date;
}

export function validateReceipt(r: ExtractedReceipt, opts: ValidationOptions = {}): FieldFlag[] {
  const flags: FieldFlag[] = [];
  const today = opts.today ?? new Date();

  if (r.unreadable) {
    flags.push({ field: 'image', code: 'UNREADABLE', message: 'Image is blurry or unreadable — please retake the photo.' });
  }

  // --- presence ---
  if (!r.merchant_name) flags.push({ field: 'merchant_name', code: 'MISSING', message: 'Merchant name not found.' });
  if (r.total_amount == null) flags.push({ field: 'total_amount', code: 'MISSING', message: 'Total amount not found.' });
  if (!r.date) flags.push({ field: 'date', code: 'MISSING', message: 'Receipt date not found.' });

  // --- confidence ---
  for (const [field, c] of Object.entries(r.confidence ?? {})) {
    if (typeof c === 'number' && c < LOW_CONFIDENCE_THRESHOLD) {
      flags.push({ field, code: 'LOW_CONFIDENCE', message: `Low confidence (${Math.round(c * 100)}%) reading ${field.replace('_', ' ')}.` });
    }
  }

  // --- currency ---
  if (r.currency && !ISO_CURRENCIES.has(r.currency.toUpperCase())) {
    flags.push({ field: 'currency', code: 'CURRENCY_UNKNOWN', message: `Unrecognised currency "${r.currency}".` });
  }

  // --- date ---
  if (r.date) {
    const d = parseIsoDate(r.date);
    if (!d) flags.push({ field: 'date', code: 'DATE_INVALID', message: `"${r.date}" is not a valid date.` });
    else if (d.getTime() > endOfDay(today).getTime()) {
      flags.push({ field: 'date', code: 'DATE_IN_FUTURE', message: 'Date is in the future.' });
    }
  }

  // --- amounts ---
  const total = r.total_amount;
  const vat = r.vat_amount ?? 0;
  if (total != null && total < 0) flags.push({ field: 'total_amount', code: 'NEGATIVE_AMOUNT', message: 'Total is negative (refund?).' });
  if (vat < 0) flags.push({ field: 'vat_amount', code: 'NEGATIVE_AMOUNT', message: 'VAT is negative.' });

  if (total != null && total > 0 && vat > 0) {
    if (vat >= total) {
      flags.push({ field: 'vat_amount', code: 'VAT_EXCEEDS_TOTAL', message: 'VAT is greater than or equal to the total.' });
    } else {
      const impliedRate = vat / (total - vat);
      if (impliedRate > MAX_VAT_RATE) {
        flags.push({
          field: 'vat_amount',
          code: 'VAT_IMPLAUSIBLE',
          message: `VAT implies a ${(impliedRate * 100).toFixed(1)}% rate, above the EU maximum of 27%.`,
        });
      }
    }
  }

  // --- items vs total (accept gross items, or net items + VAT) ---
  const pricedItems = r.items.filter((i) => typeof i.price === 'number');
  if (total != null && pricedItems.length > 0) {
    const itemsCents = pricedItems.reduce((s, i) => s + toCents(i.price as number), 0);
    const totalCents = toCents(total);
    const vatCents = toCents(vat);
    const tol = tolerance(totalCents);
    const grossOk = Math.abs(itemsCents - totalCents) <= tol;
    const netOk = vatCents > 0 && Math.abs(itemsCents + vatCents - totalCents) <= tol;
    if (!grossOk && !netOk) {
      flags.push({
        field: 'items',
        code: 'ITEMS_TOTAL_MISMATCH',
        message: `Items add up to ${(itemsCents / 100).toFixed(2)} but total is ${(totalCents / 100).toFixed(2)}.`,
      });
    }
  }

  return flags;
}

export function summariseFlags(flags: FieldFlag[]): string | null {
  if (flags.length === 0) return null;
  return flags.map((f) => f.message).join(' ');
}

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
