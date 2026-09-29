import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { POLICY_VERSION } from '@/lib/policy';
import { date } from '@/lib/format';
import { Submit } from '@/components/submit';

const PURPOSES = [
  ['ai_processing', 'AI receipt reading', 'Required to scan receipts.'],
  ['bank_access', 'Bank transaction matching', 'Optional. Read-only PSD2 access.'],
  ['marketing', 'Product update emails', 'Optional.'],
] as const;

async function setConsent(formData: FormData) {
  'use server';
  const { sb, user } = await requireUser();
  const purpose = String(formData.get('purpose'));
  if (!PURPOSES.some(([p]) => p === purpose)) return;
  const granted = formData.get('granted') === 'true';
  await sb.from('consents').insert({ user_id: user.id, purpose, granted, policy_version: POLICY_VERSION });
  revalidatePath('/settings/privacy');
}

async function eraseAccount(formData: FormData) {
  'use server';
  const { sb, user } = await requireUser();
  if (formData.get('confirm') !== 'DELETE') redirect('/settings/privacy?erase=confirm');
  await callService('ledger', '/gdpr/erase', user.id, { method: 'POST', body: { confirm: 'DELETE' }, timeoutMs: 120_000 });
  await sb.auth.signOut();
  redirect('/login?erased=1');
}

export default async function PrivacySettings({ searchParams }: { searchParams: Promise<{ erase?: string; need?: string }> }) {
  const { sb, user } = await requireUser();
  const sp = await searchParams;
  const { data: consents } = await sb.from('consents').select('purpose, granted, created_at').order('created_at', { ascending: false });
  const latest = new Map<string, { granted: boolean; created_at: string }>();
  for (const c of consents ?? []) if (!latest.has(c.purpose)) latest.set(c.purpose, c);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Privacy &amp; data</h1>
      {sp.need && <p className="flag">Please allow AI receipt reading to scan receipts.</p>}

      <section className="card space-y-3">
        <p className="label">Consents</p>
        {PURPOSES.map(([p, title, hint]) => {
          const c = latest.get(p);
          return (
            <form key={p} action={setConsent} className="flex items-center justify-between gap-3 text-sm">
              <input type="hidden" name="purpose" value={p} />
              <input type="hidden" name="granted" value={c?.granted ? 'false' : 'true'} />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="text-muted">{hint} {c ? `${c.granted ? 'Given' : 'Withdrawn'} ${date(c.created_at)}.` : 'Not given.'}</span>
              </span>
              <Submit className="btn-ghost" pending="…">{c?.granted ? 'Withdraw' : 'Allow'}</Submit>
            </form>
          );
        })}
      </section>

      <section className="card space-y-2 text-sm">
        <p className="label">Your data</p>
        <p>Signed in as {user.email}. All data is stored in the EU (Frankfurt).</p>
        <a href="/api/export" className="btn-ghost">Download all my data (JSON)</a>
        <p className="text-muted">Receipt images and records are kept until you delete them. Chat history is deleted after 30 days.</p>
        <Link href="/privacy" className="text-accent">Read the privacy notice</Link>
      </section>

      <form action="/auth/signout" method="post"><button className="btn-ghost">Sign out</button></form>

      <form action={eraseAccount} className="card space-y-2 border-bad text-sm">
        <p className="label text-bad">Delete account</p>
        <p>Permanently deletes your account, all receipts, images, splits, bank data and chat history. This cannot be undone.</p>
        {sp.erase && <p className="flag">Type DELETE to confirm.</p>}
        <input className="input" name="confirm" placeholder="Type DELETE" autoComplete="off" />
        <Submit className="btn bg-bad" pending="Deleting…">Delete everything</Submit>
      </form>
    </div>
  );
}
