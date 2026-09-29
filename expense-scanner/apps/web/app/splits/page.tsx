import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase';
import { callService, ServiceError } from '@/lib/services';
import { money } from '@/lib/format';
import { Submit } from '@/components/submit';

interface Balances {
  balances: { user_id: string; name: string; net_cents: number }[];
}

async function createGroup(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const name = z.string().trim().min(1).max(80).parse(formData.get('name'));
  await callService('ledger', '/groups', user.id, { method: 'POST', body: { name } });
  revalidatePath('/splits');
}

async function addMember(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const groupId = z.string().uuid().parse(formData.get('group_id'));
  const email = String(formData.get('email') ?? '');
  try {
    await callService('ledger', `/groups/${groupId}/members`, user.id, { method: 'POST', body: { email } });
  } catch (e) {
    redirect(`/splits?error=${encodeURIComponent(e instanceof ServiceError ? e.message : 'failed')}`);
  }
  revalidatePath('/splits');
}

async function settle(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const cp = z.string().uuid().parse(formData.get('counterparty_id'));
  await callService('ledger', '/settle', user.id, { method: 'POST', body: { counterparty_id: cp } });
  revalidatePath('/splits');
}

export default async function Splits({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { sb, user } = await requireUser();
  const sp = await searchParams;
  const [bal, { data: groups }] = await Promise.all([
    callService<Balances>('ledger', '/balances', user.id).catch(() => ({ balances: [] }) as Balances),
    sb.from('groups').select('id, name, created_by, group_members(user_id, profiles(display_name))').order('name'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Splits</h1>
      {sp.error && <p className="flag">{sp.error}</p>}

      <section className="space-y-2">
        <p className="label">Balances</p>
        {bal.balances.length === 0 && <p className="text-sm text-muted">All settled up.</p>}
        {bal.balances.map((b) => (
          <div key={b.user_id} className="card flex items-center justify-between text-sm">
            <span>
              {b.net_cents > 0 ? <>{b.name} owes you <b>{money(b.net_cents)}</b></> : <>You owe {b.name} <b>{money(-b.net_cents)}</b></>}
            </span>
            {b.net_cents > 0 && (
              <form action={settle}>
                <input type="hidden" name="counterparty_id" value={b.user_id} />
                <Submit className="btn-ghost" pending="…">Mark paid</Submit>
              </form>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <p className="label">Groups</p>
        {(groups ?? []).map((g) => (
          <div key={g.id} className="card space-y-2 text-sm">
            <p className="font-medium">{g.name}</p>
            <p className="text-muted">
              {(g.group_members ?? []).map((m: { user_id: string; profiles: unknown }) =>
                m.user_id === user.id ? 'You' : ((m.profiles as { display_name?: string } | null)?.display_name ?? 'Member')).join(', ')}
            </p>
            {g.created_by === user.id && (
              <form action={addMember} className="flex gap-2">
                <input type="hidden" name="group_id" value={g.id} />
                <input className="input" name="email" type="email" placeholder="Add member by email" required />
                <Submit className="btn-ghost">Add</Submit>
              </form>
            )}
          </div>
        ))}
        <form action={createGroup} className="flex gap-2">
          <input className="input" name="name" placeholder="New group, e.g. Flat or Lisbon trip" required maxLength={80} />
          <Submit>Create</Submit>
        </form>
        <p className="text-xs text-muted">Members need their own account; we don&apos;t store data about people who haven&apos;t signed up.</p>
      </section>
    </div>
  );
}
