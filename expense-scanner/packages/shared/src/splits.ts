import { allocate } from './money';

export interface SplitLine {
  participant_id: string;
  amount_cents: number;
}

/** Equal split: exact to the cent, remainder cents go to the first participants. */
export function splitEqual(totalCents: number, participantIds: string[]): SplitLine[] {
  const unique = [...new Set(participantIds)];
  if (unique.length === 0) throw new Error('At least one participant required');
  const parts = allocate(totalCents, unique.map(() => 1));
  return unique.map((participant_id, i) => ({ participant_id, amount_cents: parts[i]! }));
}

/**
 * Split by item. Each item's cost is shared equally among its assignees.
 * Any difference between the sum of items and the receipt total (tax, tip, service,
 * discounts) is distributed pro-rata to each person's item subtotal.
 */
export function splitByItem(
  totalCents: number,
  items: { id: string; price_cents: number }[],
  assignments: Record<string, string[]>,
): SplitLine[] {
  const owed = new Map<string, number>();
  for (const item of items) {
    const who = [...new Set(assignments[item.id] ?? [])];
    if (who.length === 0) throw new Error(`Item ${item.id} has no participants`);
    const parts = allocate(Math.max(0, item.price_cents), who.map(() => 1));
    who.forEach((p, i) => owed.set(p, (owed.get(p) ?? 0) + parts[i]!));
  }
  const people = [...owed.keys()];
  const subtotals = people.map((p) => owed.get(p)!);
  const itemsSum = subtotals.reduce((a, b) => a + b, 0);
  if (itemsSum === 0) return splitEqual(totalCents, people);
  const final = allocate(totalCents, subtotals);
  return people.map((participant_id, i) => ({ participant_id, amount_cents: final[i]! }));
}

/** Custom split: shares must add up exactly to the total. */
export function splitCustom(totalCents: number, shares: Record<string, number>): SplitLine[] {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  if (sum !== totalCents) throw new Error(`Shares sum to ${sum} cents but total is ${totalCents}`);
  return Object.entries(shares).map(([participant_id, amount_cents]) => ({ participant_id, amount_cents }));
}

export interface Debt {
  from: string;
  to: string;
  amount_cents: number;
}

/**
 * Minimise the number of transfers needed to settle a set of debts
 * (greedy: largest debtor pays largest creditor).
 */
export function simplifyDebts(debts: Debt[]): Debt[] {
  const net = new Map<string, number>();
  for (const d of debts) {
    net.set(d.from, (net.get(d.from) ?? 0) - d.amount_cents);
    net.set(d.to, (net.get(d.to) ?? 0) + d.amount_cents);
  }
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const out: Debt[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!, c = creditors[j]!;
    const amt = Math.min(d.v, c.v);
    if (amt > 0) out.push({ from: d.id, to: c.id, amount_cents: amt });
    d.v -= amt; c.v -= amt;
    if (d.v === 0) i++;
    if (c.v === 0) j++;
  }
  return out;
}
