import { z } from 'zod';
import { audit, createService, db, HttpError, start } from '@es/service-kit';
import {
  SplitRequestSchema, splitByItem, splitCustom, splitEqual, simplifyDebts, matchReceipts, toCents,
  type Debt, type SplitLine,
} from '@es/shared';
import * as eb from './enable-banking';

const app = await createService('ledger');

/* ------------------------------------------------------------------ */
/* Splits                                                              */
/* ------------------------------------------------------------------ */

app.post('/splits', async (req) => {
  const body = SplitRequestSchema.parse(req.body);
  const userId = req.userId;

  const { data: r } = await db()
    .from('receipts')
    .select('id, user_id, group_id, total_cents, receipt_items(id, price_cents)')
    .eq('id', body.receipt_id)
    .single();
  if (!r) throw new HttpError(404, 'receipt not found');
  if (r.user_id !== userId) throw new HttpError(403, 'only the receipt owner can split it');
  if (r.total_cents == null) throw new HttpError(422, 'receipt total missing — correct it first');

  // Everyone involved must be the owner or a member of the receipt's group.
  const people = new Set<string>([body.payer_id]);
  if (body.mode === 'equal') body.participant_ids.forEach((p) => people.add(p));
  if (body.mode === 'by_item') Object.values(body.assignments).flat().forEach((p) => people.add(p));
  if (body.mode === 'custom') Object.keys(body.shares).forEach((p) => people.add(p));
  await assertAllowedParticipants(userId, r.group_id, [...people]);

  let lines: SplitLine[];
  if (body.mode === 'equal') lines = splitEqual(r.total_cents, body.participant_ids);
  else if (body.mode === 'custom') lines = splitCustom(r.total_cents, body.shares);
  else {
    const items = (r.receipt_items ?? []).map((i: { id: string; price_cents: number | null }) => ({
      id: i.id, price_cents: i.price_cents ?? 0,
    }));
    lines = splitByItem(r.total_cents, items, body.assignments);
  }

  await db().from('expense_splits').delete().eq('receipt_id', r.id);
  const rows = lines
    .filter((l) => l.participant_id !== body.payer_id) // payer doesn't owe themselves
    .map((l) => ({
      receipt_id: r.id, payer_id: body.payer_id, participant_id: l.participant_id,
      amount_cents: l.amount_cents, mode: body.mode,
    }));
  if (rows.length) {
    const { error } = await db().from('expense_splits').insert(rows);
    if (error) throw error;
  }
  await audit(userId, 'split.create', 'receipt', r.id);
  return { lines };
});

async function assertAllowedParticipants(userId: string, groupId: string | null, ids: string[]) {
  const others = ids.filter((id) => id !== userId);
  if (others.length === 0) return;
  if (!groupId) throw new HttpError(422, 'assign the receipt to a group to split with others');
  const { data } = await db().from('group_members').select('user_id').eq('group_id', groupId).in('user_id', ids);
  const members = new Set((data ?? []).map((m: { user_id: string }) => m.user_id));
  if (!members.has(userId) || others.some((o) => !members.has(o))) {
    throw new HttpError(403, 'all participants must be members of the group');
  }
}

app.get('/balances', async (req) => {
  const userId = req.userId;
  const { data } = await db()
    .from('expense_splits')
    .select('payer_id, participant_id, amount_cents')
    .eq('status', 'pending')
    .or(`payer_id.eq.${userId},participant_id.eq.${userId}`);
  const debts: Debt[] = (data ?? []).map((s: { payer_id: string; participant_id: string; amount_cents: number }) => ({
    from: s.participant_id, to: s.payer_id, amount_cents: s.amount_cents,
  }));
  const net = new Map<string, number>(); // + they owe me, - I owe them
  for (const d of debts) {
    if (d.to === userId) net.set(d.from, (net.get(d.from) ?? 0) + d.amount_cents);
    else if (d.from === userId) net.set(d.to, (net.get(d.to) ?? 0) - d.amount_cents);
  }
  const ids = [...net.keys()];
  const { data: profiles } = ids.length
    ? await db().from('profiles').select('id, display_name').in('id', ids)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]));
  return {
    balances: ids.map((id) => ({ user_id: id, name: names.get(id) ?? 'Unknown', net_cents: net.get(id)! })),
    suggested_transfers: simplifyDebts(debts).filter((t) => t.from === userId || t.to === userId),
  };
});

app.post('/settle', async (req) => {
  const { counterparty_id } = z.object({ counterparty_id: z.string().uuid() }).parse(req.body);
  // Only the creditor (payer) confirms receipt of money.
  const { error, count } = await db()
    .from('expense_splits')
    .update({ status: 'settled', settled_at: new Date().toISOString() }, { count: 'exact' })
    .eq('payer_id', req.userId)
    .eq('participant_id', counterparty_id)
    .eq('status', 'pending');
  if (error) throw error;
  await audit(req.userId, 'split.settle');
  return { settled: count ?? 0 };
});

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

app.post('/groups', async (req) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  const { data: g, error } = await db().from('groups').insert({ name, created_by: req.userId }).select('id').single();
  if (error || !g) throw error ?? new Error('group create failed');
  await db().from('group_members').insert({ group_id: g.id, user_id: req.userId, role: 'owner' });
  return { id: g.id };
});

/** Add a member by email — only if that person already has an account (no invites of non-users = data minimisation). */
app.post('/groups/:id/members', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const { data: me } = await db().from('group_members').select('role').eq('group_id', id).eq('user_id', req.userId).single();
  if (me?.role !== 'owner') throw new HttpError(403, 'only the group owner can add members');
  const { data: uid } = await db().rpc('user_id_by_email', { e: email });
  if (!uid) throw new HttpError(404, 'no account with that email');
  await db().from('group_members').upsert({ group_id: id, user_id: uid, role: 'member' });
  await audit(req.userId, 'group.add_member', 'group', id);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* Spending summary (used by dashboard + chatbot)                      */
/* ------------------------------------------------------------------ */

app.get('/summary', async (req) => {
  const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(req.query);
  let query = db().from('receipts').select('category, total_cents, currency, receipt_date, is_flagged').eq('user_id', req.userId);
  if (q.from) query = query.gte('receipt_date', q.from);
  if (q.to) query = query.lte('receipt_date', q.to);
  const { data } = await query;
  const byCategory: Record<string, number> = {};
  let total = 0, flagged = 0;
  for (const r of data ?? []) {
    byCategory[r.category ?? 'other'] = (byCategory[r.category ?? 'other'] ?? 0) + (r.total_cents ?? 0);
    total += r.total_cents ?? 0;
    if (r.is_flagged) flagged++;
  }
  return { count: data?.length ?? 0, total_cents: total, flagged, by_category_cents: byCategory };
});

/* ------------------------------------------------------------------ */
/* Open banking (Enable Banking)                                       */
/* ------------------------------------------------------------------ */

app.get('/bank/aspsps', async (req) => {
  const { country } = z.object({ country: z.string().length(2) }).parse(req.query);
  return { banks: await eb.listBanks(country.toUpperCase()) };
});

app.post('/bank/connect', async (req) => {
  const body = z.object({ name: z.string().min(1), country: z.string().length(2) }).parse(req.body);
  const { data: consent } = await db().from('consents').select('granted').eq('user_id', req.userId)
    .eq('purpose', 'bank_access').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!consent?.granted) throw new HttpError(403, 'bank_access consent required');

  const state = eb.newState();
  const { url, validUntil } = await eb.startAuthorization({ name: body.name, country: body.country.toUpperCase() }, state);
  await db().from('bank_connections').insert({
    id: state, user_id: req.userId, aspsp_name: body.name, aspsp_country: body.country.toUpperCase(),
    valid_until: validUntil, status: 'pending',
  });
  return { url };
});

app.post('/bank/callback', async (req) => {
  const { code, state } = z.object({ code: z.string().min(1), state: z.string().uuid() }).parse(req.body);
  const { data: conn } = await db().from('bank_connections').select('id, status')
    .eq('id', state).eq('user_id', req.userId).single(); // CSRF: state must belong to caller
  if (!conn || conn.status !== 'pending') throw new HttpError(400, 'invalid state');
  const s = await eb.createSession(code);
  await db().from('bank_connections').update({
    session_id: s.session_id, account_uids: s.accounts.map((a) => a.uid),
    valid_until: s.access.valid_until, status: 'active',
  }).eq('id', conn.id);
  await audit(req.userId, 'bank.connect', 'bank_connection', conn.id);
  return { ok: true };
});

app.post('/bank/sync', async (req) => {
  const userId = req.userId;
  const { data: conns } = await db().from('bank_connections').select('id, account_uids')
    .eq('user_id', userId).eq('status', 'active');
  const dateFrom = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  let imported = 0;
  for (const c of conns ?? []) {
    for (const uid of c.account_uids as string[]) {
      const txs = await eb.fetchTransactions(uid, dateFrom);
      const rows = txs
        .filter((t) => t.credit_debit_indicator === 'DBIT')
        .map((t) => ({
          user_id: userId, connection_id: c.id,
          external_id: t.entry_reference ?? t.transaction_id ?? `${t.booking_date}-${t.transaction_amount.amount}-${(t.remittance_information ?? []).join(' ').slice(0, 40)}`,
          amount_cents: toCents(Math.abs(Number(t.transaction_amount.amount))),
          currency: t.transaction_amount.currency,
          booking_date: t.booking_date ?? t.value_date ?? dateFrom,
          description: [t.creditor?.name, ...(t.remittance_information ?? [])].filter(Boolean).join(' ').slice(0, 300),
        }));
      if (rows.length) {
        await db().from('bank_transactions').upsert(rows, { onConflict: 'connection_id,external_id', ignoreDuplicates: true });
        imported += rows.length;
      }
    }
  }
  const matched = await reconcile(userId);
  await audit(userId, 'bank.sync');
  return { imported, matched };
});

async function reconcile(userId: string): Promise<number> {
  const [{ data: receipts }, { data: txs }] = await Promise.all([
    db().from('receipts').select('id, total_cents, currency, receipt_date, merchant_name')
      .eq('user_id', userId).is('bank_transaction_id', null).not('total_cents', 'is', null).not('receipt_date', 'is', null),
    db().from('bank_transactions').select('id, amount_cents, currency, booking_date, description')
      .eq('user_id', userId).is('matched_receipt_id', null),
  ]);
  const matches = matchReceipts(
    (receipts ?? []).map((r) => ({ id: r.id, total_cents: r.total_cents, currency: r.currency, date: r.receipt_date, merchant_name: r.merchant_name })),
    (txs ?? []).map((t) => ({ id: t.id, amount_cents: t.amount_cents, currency: t.currency, booking_date: t.booking_date, description: t.description ?? '' })),
  );
  for (const m of matches) {
    await db().from('bank_transactions').update({ matched_receipt_id: m.receipt_id, match_score: m.score }).eq('id', m.transaction_id).eq('user_id', userId);
    await db().from('receipts').update({ bank_transaction_id: m.transaction_id }).eq('id', m.receipt_id).eq('user_id', userId);
  }
  return matches.length;
}

app.post('/bank/:id/revoke', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { data: c } = await db().from('bank_connections').select('session_id').eq('id', id).eq('user_id', req.userId).single();
  if (!c) throw new HttpError(404, 'not found');
  if (c.session_id) await eb.deleteSession(c.session_id);
  await db().from('bank_connections').update({ status: 'revoked' }).eq('id', id);
  await db().from('bank_transactions').delete().eq('connection_id', id); // data minimisation
  await audit(req.userId, 'bank.revoke', 'bank_connection', id);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* GDPR — Right to erasure (Art. 17)                                   */
/* ------------------------------------------------------------------ */

app.post('/gdpr/erase', async (req) => {
  const userId = req.userId;
  const { confirm } = z.object({ confirm: z.literal('DELETE') }).parse(req.body);
  void confirm;
  // 1. revoke bank sessions at the provider
  const { data: conns } = await db().from('bank_connections').select('session_id').eq('user_id', userId);
  for (const c of conns ?? []) if (c.session_id) await eb.deleteSession(c.session_id);
  // 2. delete stored images
  const bucket = db().storage.from('receipts');
  for (;;) {
    const { data: files } = await bucket.list(userId, { limit: 1000 });
    if (!files?.length) break;
    await bucket.remove(files.map((f) => `${userId}/${f.name}`));
    if (files.length < 1000) break;
  }
  // 3. anonymise audit trail, then delete the auth user (cascades to all tables)
  await db().rpc('anonymise_audit', { uid: userId });
  const { error } = await db().auth.admin.deleteUser(userId);
  if (error) throw error;
  await db().from('audit_log').insert({ user_id: null, action: 'gdpr.erase' });
  return { erased: true };
});

await start(app, 4002);
