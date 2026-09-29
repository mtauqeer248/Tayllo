import Link from 'next/link';
import { requireUser } from '@/lib/supabase';
import { money, date } from '@/lib/format';

export default async function Receipts({ searchParams }: { searchParams: Promise<{ flagged?: string }> }) {
  const { sb } = await requireUser();
  const sp = await searchParams;
  let q = sb.from('receipts')
    .select('id, merchant_name, receipt_date, total_cents, currency, category, is_flagged, status, bank_transaction_id')
    .order('receipt_date', { ascending: false, nullsFirst: true }).limit(100);
  if (sp.flagged) q = q.eq('is_flagged', true);
  const { data } = await q;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Receipts</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/receipts" className={sp.flagged ? 'btn-ghost' : 'btn'}>All</Link>
          <Link href="/receipts?flagged=1" className={sp.flagged ? 'btn' : 'btn-ghost'}>Needs review</Link>
        </div>
      </div>
      {data?.length ? (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id}>
              <Link href={`/receipts/${r.id}`} className="card flex items-center justify-between text-sm">
                <span>
                  <span className="block font-medium">{r.merchant_name ?? (r.status === 'processing' ? 'Processing…' : 'Unknown merchant')}</span>
                  <span className="text-muted capitalize">{date(r.receipt_date)} · {r.category}{r.bank_transaction_id ? ' · ✓ bank matched' : ''}</span>
                </span>
                <span className="flex items-center gap-2">
                  {r.is_flagged && <span className="flag">review</span>}
                  <span className="font-medium">{money(r.total_cents, r.currency)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Nothing here.</p>}
    </div>
  );
}
