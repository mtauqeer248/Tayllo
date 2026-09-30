import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { done, fail, errorText } from '@/lib/flash';
import { POLICY_VERSION } from '@/lib/policy';
import { money, date } from '@/lib/format';
import { Submit } from '@/components/submit';

const COUNTRIES = ['AT','BE','DE','DK','EE','ES','FI','FR','IE','IT','LT','LU','LV','NL','NO','PL','PT','SE'];

async function giveConsent() {
  'use server';
  const { sb, user } = await requireUser();
  const { error } = await sb.from('consents').insert({ user_id: user.id, purpose: 'bank_access', granted: true, policy_version: POLICY_VERSION });
  if (error) fail('/bank', 'Could not save your consent. Please try again.');
  done('/bank', 'Thanks — now choose your bank.');
}

async function connect(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const body = z.object({ name: z.string().min(1), country: z.string().length(2) }).parse({
    name: formData.get('bank'), country: formData.get('country'),
  });
  let url: string | null = null;
  let err: string | null = null;
  try {
    ({ url } = await callService<{ url: string }>('ledger', '/bank/connect', user.id, { method: 'POST', body }));
  } catch (e) {
    err = errorText(e, 'Could not start the bank connection.');
  }
  if (err || !url) fail('/bank', err ?? 'Could not start the bank connection.');
  redirect(url);
}

async function sync() {
  'use server';
  const { user } = await requireUser();
  let res: { imported: number; matched: number } | null = null;
  let err: string | null = null;
  try {
    res = await callService<{ imported: number; matched: number }>('ledger', '/bank/sync', user.id, { method: 'POST', body: {}, timeoutMs: 90_000 });
  } catch (e) {
    err = errorText(e, 'Bank sync failed. Please try again.');
  }
  if (err) fail('/bank', err);
  done('/bank', `Synced. ${res?.imported ?? 0} payments checked, ${res?.matched ?? 0} matched to receipts.`);
}

async function revoke(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const id = z.string().uuid().parse(formData.get('id'));
  let err: string | null = null;
  try {
    await callService('ledger', `/bank/${id}/revoke`, user.id, { method: 'POST', body: {} });
  } catch (e) {
    err = errorText(e, 'Could not revoke access.');
  }
  if (err) fail('/bank', err);
  done('/bank', 'Bank access revoked and its data deleted.');
}

export default async function Bank({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const { sb, user } = await requireUser();
  const sp = await searchParams;
  const country = COUNTRIES.includes(sp.country ?? '') ? sp.country! : 'DE';

  const [{ data: consent }, { data: conns }, { data: txs }] = await Promise.all([
    sb.from('consents').select('granted').eq('purpose', 'bank_access').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('bank_connections').select('id, aspsp_name, valid_until, status').neq('status', 'pending').order('created_at', { ascending: false }),
    sb.from('bank_transactions').select('id, booking_date, description, amount_cents, currency, matched_receipt_id').order('booking_date', { ascending: false }).limit(30),
  ]);
  const banks = consent?.granted
    ? await callService<{ banks: { name: string }[] }>('ledger', `/bank/aspsps?country=${country}`, user.id).then((r) => r.banks).catch(() => [])
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Bank matching</h1>
      <p className="text-sm text-muted">Connect a bank account (read-only, PSD2 via Enable Banking) to match your receipts with card payments. Access expires after 90 days and can be revoked any time.</p>

      {!consent?.granted ? (
        <form action={giveConsent} className="card space-y-3 text-sm">
          <p>We will read your account transactions for the last 60 days to match them with receipts. We never see your bank credentials and cannot make payments.</p>
          <Submit>I agree — continue</Submit>
        </form>
      ) : (
        <div className="card space-y-3">
          <form className="flex gap-2">
            <select name="country" defaultValue={country} className="input w-24">{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn-ghost">Show banks</button>
          </form>
          <form action={connect} className="flex gap-2">
            <input type="hidden" name="country" value={country} />
            <select name="bank" className="input" required>
              {banks.map((b) => <option key={b.name}>{b.name}</option>)}
            </select>
            <Submit pending="Redirecting…">Connect</Submit>
          </form>
        </div>
      )}

      {!!conns?.length && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="label">Connections</p>
            <form action={sync}><Submit className="btn-ghost" pending="Syncing…">Sync now</Submit></form>
          </div>
          {conns.map((c) => (
            <div key={c.id} className="card flex items-center justify-between text-sm">
              <span>{c.aspsp_name} <span className="text-muted">· {c.status} · until {date(c.valid_until)}</span></span>
              {c.status === 'active' && <form action={revoke}><input type="hidden" name="id" value={c.id} /><Submit className="text-bad" pending="…">Revoke</Submit></form>}
            </div>
          ))}
        </section>
      )}

      {!!txs?.length && (
        <section className="card">
          <p className="label">Recent card payments</p>
          <ul className="divide-y divide-line text-sm">
            {txs.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 py-1.5">
                <span className="truncate">{date(t.booking_date)} · {t.description}</span>
                <span className="whitespace-nowrap">{money(t.amount_cents, t.currency)} {t.matched_receipt_id ? '✓' : <span className="text-warn">no receipt</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
