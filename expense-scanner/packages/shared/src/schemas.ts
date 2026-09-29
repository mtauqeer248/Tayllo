import { z } from 'zod';

/** Raw shape the vision model is asked to return. Numbers may be null when unreadable. */
export const ExtractedItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive().nullable().default(1),
  unit_price: z.number().nullable().optional(),
  price: z.number().nullable(), // line total
  vat_rate: z.number().min(0).max(100).nullable().optional(),
});

export const ExtractedReceiptSchema = z.object({
  merchant_name: z.string().trim().max(200).nullable(),
  merchant_vat_id: z.string().trim().max(40).nullable().optional(),
  country_code: z.string().length(2).nullable().optional(),
  currency: z.string().length(3).nullable().default('EUR'),
  date: z.string().nullable(), // YYYY-MM-DD
  subtotal_amount: z.number().nullable().optional(),
  vat_amount: z.number().nullable(),
  total_amount: z.number().nullable(),
  items: z.array(ExtractedItemSchema).max(300).default([]),
  /** 0..1 self-reported confidence per key field */
  confidence: z
    .object({
      merchant_name: z.number().min(0).max(1).optional(),
      date: z.number().min(0).max(1).optional(),
      total_amount: z.number().min(0).max(1).optional(),
      vat_amount: z.number().min(0).max(1).optional(),
    })
    .partial()
    .default({}),
  unreadable: z.boolean().optional().default(false),
});
export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;

export const FieldFlagSchema = z.object({
  field: z.string(),
  code: z.enum([
    'MISSING',
    'LOW_CONFIDENCE',
    'ITEMS_TOTAL_MISMATCH',
    'VAT_IMPLAUSIBLE',
    'VAT_EXCEEDS_TOTAL',
    'DATE_INVALID',
    'DATE_IN_FUTURE',
    'CURRENCY_UNKNOWN',
    'NEGATIVE_AMOUNT',
    'UNREADABLE',
  ]),
  message: z.string(),
});
export type FieldFlag = z.infer<typeof FieldFlagSchema>;

export const OcrResultSchema = z.object({
  receipt: ExtractedReceiptSchema,
  flags: z.array(FieldFlagSchema),
  is_flagged: z.boolean(),
  flag_reason: z.string().nullable(),
});
export type OcrResult = z.infer<typeof OcrResultSchema>;

/* ---------- Splits ---------- */
export const SplitRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('equal'),
    receipt_id: z.string().uuid(),
    payer_id: z.string().uuid(),
    participant_ids: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    mode: z.literal('by_item'),
    receipt_id: z.string().uuid(),
    payer_id: z.string().uuid(),
    /** item_id -> participants sharing that item */
    assignments: z.record(z.string().uuid(), z.array(z.string().uuid()).min(1)),
  }),
  z.object({
    mode: z.literal('custom'),
    receipt_id: z.string().uuid(),
    payer_id: z.string().uuid(),
    /** participant -> amount in cents */
    shares: z.record(z.string().uuid(), z.number().int().nonnegative()),
  }),
]);
export type SplitRequest = z.infer<typeof SplitRequestSchema>;

export const ReceiptCorrectionSchema = z.object({
  merchant_name: z.string().trim().max(200).optional(),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  total_amount: z.number().nonnegative().optional(),
  vat_amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  category: z.string().max(50).optional(),
  /** user confirms total is correct even though items don't add up (e.g. unlisted fees) */
  items_confirmed: z.boolean().optional(),
});
export type ReceiptCorrection = z.infer<typeof ReceiptCorrectionSchema>;

export const CATEGORIES = [
  'groceries',
  'restaurants',
  'transport',
  'travel',
  'utilities',
  'health',
  'shopping',
  'entertainment',
  'office',
  'other',
] as const;

export const ISO_CURRENCIES = new Set([
  'EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'USD',
]);
