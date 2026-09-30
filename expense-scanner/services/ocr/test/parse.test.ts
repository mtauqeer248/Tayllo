import { describe, expect, it } from 'vitest';
import { parseExtraction, parseLocaleNumber } from '../src/groq';

describe('parseExtraction', () => {
  it('coerces European number formats', () => {
    const r = parseExtraction(JSON.stringify({
      merchant_name: 'Lidl', currency: 'eur', date: '2026-09-01',
      total_amount: '1.234,50', vat_amount: '12,30',
      items: [{ description: 'x', price: '€ 3,99' }],
    }));
    expect(r.total_amount).toBe(1234.5);
    expect(r.vat_amount).toBe(12.3);
    expect(r.items[0]!.price).toBe(3.99);
    expect(r.currency).toBe('EUR');
  });
  it('parses both separator conventions', () => {
    expect(parseLocaleNumber('1,234.50')).toBe(1234.5);
    expect(parseLocaleNumber('1.234,50')).toBe(1234.5);
    expect(parseLocaleNumber('12')).toBe(12);
    expect(parseLocaleNumber('abc')).toBeNull();
  });
  it('marks garbage as unreadable', () => {
    expect(parseExtraction('not json').unreadable).toBe(true);
  });
});

describe('parseExtraction — tolerant to other model styles', () => {
  it('reads a wrapped answer with alternative keys, text numbers and a European date', () => {
    const r = parseExtraction('```json\n' + JSON.stringify({
      receipt: {
        merchant: 'MARKTLADEN BERLIN', date: '28.09.2026', currency: '€',
        total: '21,00', vat: '2,03', country_code: 'Germany',
        items: [{ name: 'Vollkornbrot', price: '3,49' }, { description: '', price: 1 }],
        confidence: { merchant_name: '95', total_amount: 0.9 },
      },
    }) + '\n```');
    expect(r.unreadable).toBe(false);
    expect(r.merchant_name).toBe('MARKTLADEN BERLIN');
    expect(r.date).toBe('2026-09-28');
    expect(r.total_amount).toBe(21);
    expect(r.vat_amount).toBe(2.03);
    expect(r.currency).toBe('EUR');
    expect(r.country_code).toBeNull();
    expect(r.items).toHaveLength(1);
    expect(r.confidence.merchant_name).toBe(0.95);
  });
  it('keeps good fields when one field is odd', () => {
    const r = parseExtraction(JSON.stringify({ merchant_name: 'Cafe', total_amount: 25.7, vat_amount: 'n/a', date: '27/09/2026', items: 'none' }));
    expect(r.total_amount).toBe(25.7);
    expect(r.vat_amount).toBeNull();
    expect(r.date).toBe('2026-09-27');
    expect(r.items).toEqual([]);
  });
  it('empty answer is unreadable', () => {
    expect(parseExtraction('').unreadable).toBe(true);
  });
});
