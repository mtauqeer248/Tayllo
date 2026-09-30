import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CATEGORIES, type FieldFlag } from '@es/shared';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { done, fail, errorText } from '@/lib/flash';
import { money, date } from '@/lib/format';
import { Submit } from '@/components/submit';

const Id = z.string().uuid();
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().replace(',', '.');
  return s === '' ? undefined : Number(s);
};

async function correct(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const id = Id.parse(formData.get('id'));
  const changes = {
    merchant_name: String(formData.get('merchant_name') ?? '').trim() || undefined,
    receipt_date: String(formData.get('receipt_date') ?? '') || undefined,
    total_amount: num(formData.get('total_amount')),
    vat_amount: num(formData.get('vat_amount')),
    category: String(formData.get('category') ?? '') || undefined,
    items_confirmed: formData.get('items_confirmed') === 'on' ? true : undefined,
  };
  let res: { is_flagged: boolean } | null = null;
  let err: string | null = null;
  try {
    res = await callService<{ is_flagged: boolean }>('ocr', '/correct', user.id, { method: 'POST', body: { receipt_id: id, changes } });
  } catch (e) {
    err = errorText(e, 'Could not save your changes. Please try again.');
  }
  if (err) fail(`/receipts/${id}`, err);
  if (res?.is_flagged) done(`/receipts/${id}`, 'Saved. Some fields still look doubtful — please check them.');
  done(`/receipts/${id}`, 'Saved — everything checks out.');
}

async function retry(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const id = Id.parse(formData.get('id'));
  let err: string | null = null;
  try {
    await callService('ocr', '/process', user.id, { method: 'POST', body: { receipt_id: id } });
  } catch (e) {
    err = errorText(e, 'Still could not read this image. Try a clearer photo.');
  }
  if (err) fail(`/receipts/${id}`, err);
  done(`/receipts/${id}`, 'Receipt read again');
}

async function split(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const id = Id.parse(formData.get('id'));
  const mode = String(formData.get('mode'));
  let body: unknown;
  if (mode === 'equal') {
    body = { mode, receipt_id: id, payer_id: user.id, participant_ids: formData.getAll('participant').map(String) };
  } else if (mode === 'by_item') {
    const assignments: Record<string, string[]> = {};
    for (const [k, v] of formData.entries()) {
      if (k.startsWith('item:')) (assignments[k.slice(5)] ??= []).push(String(v));
    }
    body = { mode, receipt_id: id, payer_id: user.id, assignments };
  } else {
    const shares: Record<string, number> = {};
    for (const [k, v] of formData.entries()) {
      if (k.startsWith('share:') && String(v).trim() !== '') shares[k.slice(6)] = Math.round((num(v) ?? 0) * 100);
    }
    body = { mode: 'custom', receipt_id: id, payer_id: user.id, shares };
  }
  let err: string | null = null;
  try {
    await callService('ledger', '/splits', user.id, { method: 'POST', body });
  } catch (e) {
    err = errorText(e, 'Could not split this receipt. Please try again.');
  }
  if (err) fail(`/receipts/${id}`, err);
  done(`/receipts/${id}`, 'Split saved');
}

async function remove(formData: FormData) {
  'use server';
  const { sb } = await requireUser();
  const id = Id.parse(formData.get('id'));
  const { data } = await sb.from('receipts').select('file_path').eq('id', id).single();
  if (data?.file_path) await sb.storage.from('receipts').remove([data.file_path]);
  const { error } = await sb.from('receipts').delete().eq('id', id);
  if (error) fail(`/receipts/${id}`, 'Could not delete the receipt. Please try again.');
  done('/receipts', 'Receipt and image deleted');
}

export default async function ReceiptPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const { sb, user } = await requireUser();
  const { data: r } = await sb.from('receipts')
    .select('*, receipt_items(id, position, description, quantity, price_cents), expense_splits(participant_id, amount_cents, status, mode)')
    .eq('id', id).single();
  if (!r) notFound();

  const isOwner = r.user_id === user.id;
  const flags = (r.flags ?? []) as FieldFlag[];
  const flagFor = (f: string) => flags.filter((x) => x.field === f);
  const items = [...(r.receipt_items ?? [])].sort((a, b) => a.position - b.position);
  const img = r.file_path ? (await sb.storage.from('receipts').createSignedUrl(r.file_path, 120)).data?.signedUrl : null;

  const { data: members } = r.group_id
    ? await sb.from('group_members').select('user_id, profiles(display_name)').eq('group_id', r.group_id)
    : { data: [] as { user_id: string; profiles: { display_name: string } | null }[] };
  const people = (members ?? []).map((m) => ({
    id: m.user_id,
    name: m.user_id === user.id ? 'Me' : ((m.profiles as unknown as { display_name?: string } | null)?.display_name ?? 'Member'),
  }));
  const nameOf = (uid: string) => people.find((p) => p.id === uid)?.name ?? 'Member';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{r.merchant_name ?? 'Unknown merchant'}</h1>
          <p className="text-sm text-muted">{date(r.receipt_date)} · {money(r.total_cents, r.currency)}</p>
        </div>
        {img && <a href={img} target="_blank" rel="noreferrer"><img src={img} alt="Receipt" className="h-24 w-20 rounded-lg border border-line object-cover" /></a>}
      </div>

      {r.status === 'processing' && <p className="card text-sm">Still reading this receipt… refresh in a few seconds.</p>}
      {r.status === 'failed' && isOwner && (
        <form action={retry} className="flag flex items-center justify-between">
          <span>We couldn&apos;t read this image.</span>
          <input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost" pending="Retrying…">Retry</Submit>
        </form>
      )}

      {r.is_flagged && flags.length > 0 && (
        <section className="space-y-1">
          <p className="label">Please check</p>
          {flags.map((f, i) => <p key={i} className="flag">{f.message}</p>)}
        </section>
      )}

      {isOwner && (
        <form action={correct} className="card space-y-3">
          <input type="hidden" name="id" value={r.id} />
          <p className="label">Details {r.is_flagged ? '— correct the highlighted fields' : ''}</p>
          <Field name="merchant_name" label="Merchant" defaultValue={r.merchant_name ?? ''} flagged={flagFor('merchant_name').length > 0} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="receipt_date" label="Date" type="date" defaultValue={r.receipt_date ?? ''} flagged={flagFor('date').length > 0} />
            <div>
              <label className="label" htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue={r.category ?? 'other'} className="input capitalize">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Field name="total_amount" label={`Total (${r.currency})`} inputMode="decimal" defaultValue={r.total_cents != null ? (r.total_cents / 100).toFixed(2) : ''} flagged={flagFor('total_amount').length > 0 || flagFor('items').length > 0} />
            <Field name="vat_amount" label="VAT" inputMode="decimal" defaultValue={((r.vat_cents ?? 0) / 100).toFixed(2)} flagged={flagFor('vat_amount').length > 0} />
          </div>
          {flagFor('items').length > 0 && (
            <label className="flex gap-2 text-sm"><input type="checkbox" name="items_confirmed" /> The total is correct (items don&apos;t add up because of fees/deposit)</label>
          )}
          <Submit pending="Saving…">Save &amp; re-check</Submit>
        </form>
      )}

      {items.length > 0 && (
        <section className="card">
          <p className="label">Items</p>
          <ul className="divide-y divide-line text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between py-1.5"><span>{i.description}</span><span>{money(i.price_cents, r.currency)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3">
        <p className="label">Split</p>
        {(r.expense_splits ?? []).length > 0 && (
          <ul className="text-sm">
            {r.expense_splits.map((s: { participant_id: string; amount_cents: number; status: string }) => (
              <li key={s.participant_id} className="flex justify-between">
                <span>{nameOf(s.participant_id)} owes</span>
                <span>{money(s.amount_cents, r.currency)} {s.status === 'settled' && '✓'}</span>
              </li>
            ))}
          </ul>
        )}
        {!isOwner ? null : !r.group_id ? (
          <p className="text-sm text-muted">Scan it into a group to split it. Create groups on the Splits page.</p>
        ) : r.total_cents == null ? (
          <p className="text-sm text-muted">Add the total first.</p>
        ) : (
          <div className="space-y-4">
            <form action={split} className="space-y-2">
              <input type="hidden" name="id" value={r.id} /><input type="hidden" name="mode" value="equal" />
              <p className="text-sm font-medium">Equally between</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {people.map((p) => <label key={p.id} className="flex gap-1"><input type="checkbox" name="participant" value={p.id} defaultChecked /> {p.name}</label>)}
              </div>
              <Submit className="btn-ghost">Split equally</Submit>
            </form>
            {items.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">By item</summary>
                <form action={split} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="mode" value="by_item" />
                  {items.map((i) => (
                    <div key={i.id} className="text-sm">
                      <p>{i.description} <span className="text-muted">{money(i.price_cents, r.currency)}</span></p>
                      <div className="flex flex-wrap gap-3">
                        {people.map((p) => <label key={p.id} className="flex gap-1"><input type="checkbox" name={`item:${i.id}`} value={p.id} defaultChecked /> {p.name}</label>)}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted">Tax, tips and discounts are shared in proportion.</p>
                  <Submit className="btn-ghost">Split by item</Submit>
                </form>
              </details>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium">Custom amounts</summary>
              <form action={split} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="mode" value="custom" />
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="w-24">{p.name}</span><input className="input" name={`share:${p.id}`} inputMode="decimal" placeholder="0.00" />
                  </label>
                ))}
                <p className="text-xs text-muted">Must add up to {money(r.total_cents, r.currency)}.</p>
                <Submit className="btn-ghost">Save custom split</Submit>
              </form>
            </details>
          </div>
        )}
      </section>

      {isOwner && (
        <form action={remove}>
          <input type="hidden" name="id" value={r.id} />
          <button className="text-sm text-bad">Delete receipt and image</button>
        </form>
      )}
    </div>
  );
}

function Field({ name, label, flagged, ...rest }: { name: string; label: string; flagged?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}{flagged && <span className="ml-1 text-warn">● check</span>}</label>
      <input id={name} name={name} className={`input ${flagged ? 'border-warn bg-warn-bg' : ''}`} {...rest} />
    </div>
  );
}
