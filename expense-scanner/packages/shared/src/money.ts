/** All money math is done in integer cents to avoid float drift. */
export const toCents = (n: number): number => Math.round(n * 100);
export const fromCents = (c: number): number => Math.round(c) / 100;

export function formatMoney(amount: number, currency = 'EUR', locale = 'en-IE'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

/**
 * Distribute `totalCents` across `weights` so that the parts sum exactly to the total
 * (largest-remainder method). Deterministic: ties go to earlier indices.
 */
export function allocate(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('weights must sum to > 0');
  const raw = weights.map((w) => (totalCents * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = totalCents - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    floored[order[k]!.i]! += 1;
  }
  return floored;
}
