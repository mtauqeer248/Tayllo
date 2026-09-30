import { z } from 'zod';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { done, fail, errorText } from '@/lib/flash';
import { money } from '@/lib/format';
import { Submit } from '@/components/submit';

interface Balances {
  balances: { user_id: string; name: string; net_cents: number }[];
}

async function createGroup(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const parsed = z.string().trim().min(1).max(80).safeParse(formData.get('name'));
  if (!parsed.success) fail('/splits', 'Please enter a group name.');
  let err: string | null = null;
  try {
    await callService('ledger', '/groups', user.id, { method: 'POST', body: { name: parsed.data } });
  } catch (e) {
    err = errorText(e, 'Could not create the group.');
  }
  if (err) fail('/splits', err);
  done('/splits', `Group “${parsed.data}” created`);
}

async function addMember(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const groupId = z.string().uuid().parse(formData.get('group_id'));
  const email = String(formData.get('email') ?? '').trim();
  let err: string | null = null;
  try {
    await callService('ledger', `/groups/${groupId}/members`, user.id, { method: 'POST', body: { email } });
  } catch (e) {
    err = errorText(e, 'Could not add this member.');
    if (/no account/i.test(err)) err = `${email} doesn't have a Tallyo account yet. Ask them to sign up first.`;
  }
  if (err) fail('/splits', err);
  done('/splits', `${email} added to the group`);
}

async function settle(formData: FormData) {
  'use server';
  const { user } = await requireUser();
  const cp = z.string().uuid().parse(formData.get('counterparty_id'));
  let err: string | null = null;
  try {
    await callService('ledger', '/settle', user.id, { method: 'POST', body: { counterparty_id: cp } });
  } catch (e) {
    err = errorText(e, 'Could not mark as paid.');
  }
  if (err) fail('/splits', err);
  done('/splits', 'Marked as paid');
}

export default async function Splits() {
  const { sb, user } = await requireUser();
  const [bal, { data: groups }] = await Promise.all([
    callService<Balances>('ledger', '/balances', user.id).catch(() => ({ balances: [] }) as Balances),
    sb.from('groups').select('id, name, created_by, group_members(user_id, profiles(display_name))').order('name'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Splits</h1>

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
