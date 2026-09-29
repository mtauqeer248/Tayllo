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
