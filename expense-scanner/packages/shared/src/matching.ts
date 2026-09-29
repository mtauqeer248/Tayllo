/**
 * Bank reconciliation: score how likely a bank transaction corresponds to a receipt.
 * Amount must match within 1 cent (or within FX tolerance if currencies differ);
 * date within +-4 days (card settlement lag); merchant name similarity is a bonus.
 */
export interface MatchReceipt {
  id: string;
  total_cents: number;
  currency: string;
  date: string; // YYYY-MM-DD
  merchant_name: string | null;
}
export interface MatchTransaction {
  id: string;
  amount_cents: number; // positive = debit
  currency: string;
  booking_date: string;
  description: string;
}
export interface Match {
  receipt_id: string;
  transaction_id: string;
  score: number; // 0..1
}

const DAY = 86_400_000;
const MAX_DAYS = 4;

export function normaliseMerchant(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(gmbh|sarl|sas|srl|bv|nv|ltd|ag|spa|sa|kg|oy|ab|as)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseMerchant(a).split(' ').filter((t) => t.length > 2));
  const tb = new Set(normaliseMerchant(b).split(' ').filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if ([...tb].some((u) => u.includes(t) || t.includes(u))) hit++;
  return hit / ta.size;
}

export function scoreMatch(r: MatchReceipt, t: MatchTransaction): number {
  const sameCcy = r.currency.toUpperCase() === t.currency.toUpperCase();
  const diff = Math.abs(r.total_cents - t.amount_cents);
  const amountOk = sameCcy ? diff <= 1 : diff <= Math.max(50, r.total_cents * 0.03);
  if (!amountOk) return 0;
  const days = Math.abs(Date.parse(r.date) - Date.parse(t.booking_date)) / DAY;
  if (!(days <= MAX_DAYS)) return 0;
  const amountScore = sameCcy ? 0.6 : 0.4;
  const dateScore = 0.2 * (1 - days / (MAX_DAYS + 1));
  const nameScore = r.merchant_name ? 0.2 * tokenSimilarity(r.merchant_name, t.description) : 0;
  return Math.min(1, amountScore + dateScore + nameScore);
}

/** Greedy one-to-one matching by best score. */
export function matchReceipts(receipts: MatchReceipt[], txs: MatchTransaction[], minScore = 0.6): Match[] {
  const candidates: Match[] = [];
  for (const r of receipts) for (const t of txs) {
    const score = scoreMatch(r, t);
    if (score >= minScore) candidates.push({ receipt_id: r.id, transaction_id: t.id, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedR = new Set<string>(), usedT = new Set<string>();
  const out: Match[] = [];
  for (const c of candidates) {
    if (usedR.has(c.receipt_id) || usedT.has(c.transaction_id)) continue;
    usedR.add(c.receipt_id); usedT.add(c.transaction_id);
    out.push(c);
  }
  return out;
}
