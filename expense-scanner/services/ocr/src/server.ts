import sharp from 'sharp';
import { z } from 'zod';
import { audit, checkGroqKey, createService, db, HttpError, start } from '@es/service-kit';
import { ReceiptCorrectionSchema, summariseFlags, toCents, validateReceipt } from '@es/shared';
import { extractWithGroq } from './groq';

const app = await createService('ocr');

const Body = z.object({ receipt_id: z.string().uuid() });

/**
 * POST /process — the gateway has already uploaded the image to
 * storage at receipts/<userId>/<receiptId>.<ext> and created a 'processing' row.
 */
app.post('/process', async (req) => {
  const { receipt_id } = Body.parse(req.body);
  const userId = req.userId;

  const { data: receipt, error } = await db()
    .from('receipts')
    .select('id, user_id, file_path')
    .eq('id', receipt_id)
    .eq('user_id', userId) // service role bypasses RLS: scope explicitly
    .single();
  if (error || !receipt?.file_path) throw new HttpError(404, 'receipt not found');

  try {
    const { data: file, error: dlErr } = await db().storage.from('receipts').download(receipt.file_path);
    if (dlErr || !file) throw new Error('download failed');

    // Normalise: auto-rotate from EXIF, strip metadata (GPS!), cap size for the model.
    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const extraction = await extractWithGroq(jpeg.toString('base64'), AbortSignal.timeout(30_000));
    const flags = validateReceipt(extraction);
    const isFlagged = flags.length > 0;

    const { error: upErr } = await db()
      .from('receipts')
      .update({
        status: isFlagged ? 'needs_review' : 'ready',
        merchant_name: extraction.merchant_name,
        merchant_vat_id: extraction.merchant_vat_id ?? null,
        country_code: extraction.country_code ?? null,
        currency: extraction.currency ?? 'EUR',
        receipt_date: isValidDate(extraction.date) ? extraction.date : null,
        total_cents: extraction.total_amount != null ? toCents(extraction.total_amount) : null,
        vat_cents: extraction.vat_amount != null ? toCents(extraction.vat_amount) : 0,
        is_flagged: isFlagged,
        flag_reason: summariseFlags(flags),
        flags,
        raw_extraction: extraction,
      })
      .eq('id', receipt_id)
      .eq('user_id', userId);
    if (upErr) throw upErr;

    await db().from('receipt_items').delete().eq('receipt_id', receipt_id);
    if (extraction.items.length) {
      await db().from('receipt_items').insert(
        extraction.items.map((it, i) => ({
          receipt_id,
          position: i,
          description: it.description,
          quantity: it.quantity ?? 1,
          price_cents: it.price != null ? toCents(it.price) : null,
          vat_rate: it.vat_rate ?? null,
        })),
      );
    }
    await audit(userId, 'receipt.ocr', 'receipt', receipt_id);
    return { receipt_id, is_flagged: isFlagged, flags };
  } catch (e) {
    await db().from('receipts').update({ status: 'failed', is_flagged: true, flag_reason: 'Could not process image. Please retry.' })
      .eq('id', receipt_id).eq('user_id', userId);
    throw e;
  }
});

/** POST /correct — apply user corrections to doubtful fields, log them, and re-validate. */
app.post('/correct', async (req) => {
  const { receipt_id, changes } = z
    .object({ receipt_id: z.string().uuid(), changes: ReceiptCorrectionSchema })
    .parse(req.body);
  const { data: before } = await db().from('receipts')
    .select('merchant_name, receipt_date, total_cents, vat_cents, currency, category')
    .eq('id', receipt_id).eq('user_id', req.userId).single();
  if (!before) throw new HttpError(404, 'receipt not found');

  const patch: Record<string, unknown> = {};
  if (changes.merchant_name !== undefined) patch.merchant_name = changes.merchant_name;
  if (changes.receipt_date !== undefined) patch.receipt_date = changes.receipt_date;
  if (changes.total_amount !== undefined) patch.total_cents = toCents(changes.total_amount);
  if (changes.vat_amount !== undefined) patch.vat_cents = toCents(changes.vat_amount);
  if (changes.currency !== undefined) patch.currency = changes.currency.toUpperCase();
  if (changes.category !== undefined) patch.category = changes.category;
  if (changes.items_confirmed !== undefined) patch.items_confirmed = changes.items_confirmed;

  const log = Object.entries(patch)
    .filter(([k, v]) => String((before as Record<string, unknown>)[k] ?? '') !== String(v ?? ''))
    .map(([field, v]) => ({
      receipt_id, user_id: req.userId, field,
      old_value: String((before as Record<string, unknown>)[field] ?? ''), new_value: String(v ?? ''),
    }));
  if (Object.keys(patch).length) {
    await db().from('receipts').update(patch).eq('id', receipt_id).eq('user_id', req.userId);
  }
  if (log.length) await db().from('receipt_corrections').insert(log);
  await audit(req.userId, 'receipt.correct', 'receipt', receipt_id);
  return revalidate(receipt_id, req.userId);
});

/** POST /revalidate — re-run the arithmetic checks. */
app.post('/revalidate', async (req) => {
  const { receipt_id } = Body.parse(req.body);
  return revalidate(receipt_id, req.userId);
});

async function revalidate(receipt_id: string, userId: string) {
  const req = { userId };
  const { data: r } = await db()
    .from('receipts')
    .select('merchant_name, currency, receipt_date, total_cents, vat_cents, items_confirmed, receipt_items(description, price_cents)')
    .eq('id', receipt_id)
    .eq('user_id', req.userId)
    .single();
  if (!r) throw new HttpError(404, 'receipt not found');
  const flags = validateReceipt({
    merchant_name: r.merchant_name,
    currency: r.currency,
    date: r.receipt_date,
    total_amount: r.total_cents != null ? r.total_cents / 100 : null,
    vat_amount: (r.vat_cents ?? 0) / 100,
    // If the user confirmed the total is right despite item mismatch, skip the item check.
    items: r.items_confirmed ? [] : (r.receipt_items ?? []).map((i: { description: string; price_cents: number | null }) => ({
      description: i.description,
      quantity: 1,
      price: i.price_cents != null ? i.price_cents / 100 : null,
    })),
    confidence: {}, // user-confirmed values are trusted
    unreadable: false,
  });
  await db().from('receipts').update({
    is_flagged: flags.length > 0,
    flag_reason: summariseFlags(flags),
    flags,
    status: flags.length ? 'needs_review' : 'ready',
  }).eq('id', receipt_id).eq('user_id', req.userId);
  return { is_flagged: flags.length > 0, flags };
}

function isValidDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

await start(app, 4001);
void checkGroqKey(app); // logs whether the Groq key works (masked)
app.log.info(`Groq vision model: ${process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b'}`);
