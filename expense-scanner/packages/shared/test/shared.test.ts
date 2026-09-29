import { describe, expect, it } from 'vitest';
import {
  allocate, splitEqual, splitByItem, splitCustom, simplifyDebts,
  validateReceipt, ExtractedReceiptSchema, matchReceipts, scoreMatch,
} from '../src';
import { signServiceToken, verifyServiceToken } from '../src/service-auth';

const base = (o: Partial<Record<string, unknown>> = {}) =>
  ExtractedReceiptSchema.parse({
    merchant_name: 'REWE Markt GmbH', currency: 'EUR', date: '2026-09-20',
    vat_amount: 1.6, total_amount: 10.0,
    items: [{ description: 'Milk', price: 4.0 }, { description: 'Bread', price: 6.0 }],
    ...o,
  });
const today = new Date('2026-09-29T12:00:00Z');

describe('allocate', () => {
  it('sums exactly', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(999, [2, 1]).reduce((a, b) => a + b)).toBe(999);
  });
});

describe('validateReceipt', () => {
  it('clean receipt has no flags', () => {
    expect(validateReceipt(base(), { today })).toEqual([]);
  });
  it('flags item/total mismatch', () => {
    const f = validateReceipt(base({ total_amount: 12.5 }), { today });
    expect(f.map((x) => x.code)).toContain('ITEMS_TOTAL_MISMATCH');
  });
  it('accepts net items + VAT = total', () => {
    const r = base({ total_amount: 11.9, vat_amount: 1.9 });
    expect(validateReceipt(r, { today })).toEqual([]);
  });
  it('flags implausible VAT', () => {
    const f = validateReceipt(base({ vat_amount: 4.0, items: [] }), { today });
    expect(f.map((x) => x.code)).toContain('VAT_IMPLAUSIBLE');
  });
  it('flags VAT >= total', () => {
    const f = validateReceipt(base({ vat_amount: 10, items: [] }), { today });
    expect(f.map((x) => x.code)).toContain('VAT_EXCEEDS_TOTAL');
  });
  it('flags missing, invalid and future dates', () => {
    expect(validateReceipt(base({ date: null }), { today }).map((x) => x.code)).toContain('MISSING');
    expect(validateReceipt(base({ date: '2026-02-30' }), { today }).map((x) => x.code)).toContain('DATE_INVALID');
    expect(validateReceipt(base({ date: '2026-12-01' }), { today }).map((x) => x.code)).toContain('DATE_IN_FUTURE');
  });
  it('flags low confidence and unreadable', () => {
    const f = validateReceipt(base({ confidence: { total_amount: 0.4 }, unreadable: true }), { today });
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(['LOW_CONFIDENCE', 'UNREADABLE']));
  });
});

describe('splits', () => {
  it('equal split sums to total', () => {
    const s = splitEqual(1001, ['a', 'b', 'c']);
    expect(s.reduce((x, y) => x + y.amount_cents, 0)).toBe(1001);
  });
  it('by-item split distributes tax/tip pro rata', () => {
    const s = splitByItem(1200, [{ id: 'i1', price_cents: 600 }, { id: 'i2', price_cents: 400 }], {
      i1: ['a'], i2: ['a', 'b'],
    });
    const m = Object.fromEntries(s.map((x) => [x.participant_id, x.amount_cents]));
    expect(m.a! + m.b!).toBe(1200);
    expect(m.a).toBe(960); // (600+200)/1000 * 1200
    expect(m.b).toBe(240);
  });
  it('custom split must match total', () => {
    expect(() => splitCustom(100, { a: 50, b: 40 })).toThrow();
    expect(splitCustom(100, { a: 60, b: 40 })).toHaveLength(2);
  });
  it('simplifies debts', () => {
    const out = simplifyDebts([
      { from: 'a', to: 'b', amount_cents: 100 },
      { from: 'b', to: 'c', amount_cents: 100 },
    ]);
    expect(out).toEqual([{ from: 'a', to: 'c', amount_cents: 100 }]);
  });
});

describe('matching', () => {
  const r = { id: 'r1', total_cents: 2350, currency: 'EUR', date: '2026-09-20', merchant_name: 'Café Müller SARL' };
  it('matches same amount near date', () => {
    const t = { id: 't1', amount_cents: 2350, currency: 'EUR', booking_date: '2026-09-22', description: 'CB CAFE MULLER PARIS' };
    expect(scoreMatch(r, t)).toBeGreaterThan(0.8);
    expect(matchReceipts([r], [t])).toHaveLength(1);
  });
  it('rejects different amount or far date', () => {
    expect(scoreMatch(r, { id: 't', amount_cents: 2400, currency: 'EUR', booking_date: '2026-09-20', description: '' })).toBe(0);
    expect(scoreMatch(r, { id: 't', amount_cents: 2350, currency: 'EUR', booking_date: '2026-10-10', description: '' })).toBe(0);
  });
});

describe('service tokens', () => {
  const secret = 'x'.repeat(40);
  it('round-trips and enforces audience + expiry', () => {
    const tok = signServiceToken(secret, 'user-1', 'ocr', 60, 1000);
    expect(verifyServiceToken(secret, tok, 'ocr', 1010)?.sub).toBe('user-1');
    expect(verifyServiceToken(secret, tok, 'ledger', 1010)).toBeNull();
    expect(verifyServiceToken(secret, tok, 'ocr', 2000)).toBeNull();
    expect(verifyServiceToken('y'.repeat(40), tok, 'ocr', 1010)).toBeNull();
  });
});
