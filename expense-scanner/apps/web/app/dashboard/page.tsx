import Link from 'next/link';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { money, date } from '@/lib/format';

interface Summary { count: number; total_cents: number; flagged: number; by_category_cents: Record<string, number> }
interface Balances { balances: { user_id: string; name: string; net_cents: number }[] }

export default async function Dashboard() {
  const { sb, user } = await requireUser();
  const monthStart = new Date(); monthStart.setDate(1);
  const from = monthStart.toISOString().slice(0, 10);

  const [summary, balances, recent] = await Promise.all([
    callService<Summary>('ledger', `/summary?from=${from}`, user.id).catch(() => null),
    callService<Balances>('ledger', '/balances', user.id).catch(() => null),
    sb.from('receipts').select('id, merchant_name, receipt_date, total_cents, currency, is_flagged')
      .order('created_at', { ascending: false }).limit(5),
  ]);
  const owedToMe = balances?.balances.filter((b) => b.net_cents > 0).reduce((s, b) => s + b.net_cents, 0) ?? 0;
  const iOwe = balances?.balances.filter((b) => b.net_cents < 0).reduce((s, b) => s - b.net_cents, 0) ?? 0;
  const cats = Object.entries(summary?.by_category_cents ?? {}).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">This month</h1>
        <Link href="/upload" className="btn">Scan receipt</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card"><p className="label">Spent</p><p className="text-lg font-semibold">{money(summary?.total_cents ?? 0)}</p></div>
        <div className="card"><p className="label">Owed to you</p><p className="text-lg font-semibold">{money(owedToMe)}</p></div>
        <div className="card"><p className="label">You owe</p><p className="text-lg font-semibold">{money(iOwe)}</p></div>
      </div>

      {!!summary?.flagged && (
        <Link href="/receipts?flagged=1" className="flag block">
          {summary.flagged} receipt{summary.flagged > 1 ? 's need' : ' needs'} your review →
        </Link>
      )}

      {cats.length > 0 && (
        <section className="card space-y-2">
          <p className="label">By category</p>
          {cats.map(([c, v]) => (
            <div key={c} className="text-sm">
              <div className="flex justify-between"><span className="capitalize">{c}</span><span>{money(v)}</span></div>
              <div className="mt-1 h-1.5 rounded bg-line"><div className="h-1.5 rounded bg-accent" style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <p className="label">Recent</p>
        {recent.data?.length ? recent.data.map((r) => (
          <Link key={r.id} href={`/receipts/${r.id}`} className="card flex justify-between text-sm">
            <span>{r.merchant_name ?? 'Unknown merchant'} <span className="text-muted">· {date(r.receipt_date)}</span></span>
            <span className="flex items-center gap-2">{r.is_flagged && <span className="flag">check</span>}{money(r.total_cents, r.currency)}</span>
          </Link>
        )) : <p className="text-sm text-muted">No receipts yet — scan your first one.</p>}
      </section>
    </div>
  );
}
