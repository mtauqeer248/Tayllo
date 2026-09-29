import { db, env } from '@es/service-kit';
import { CATEGORIES, formatMoney } from '@es/shared';
import { signServiceToken } from '@es/shared/service-auth';

/** Call a sibling service on behalf of the same user. */
async function svc(aud: 'ocr' | 'ledger', path: string, userId: string, init: { method?: string; body?: unknown } = {}) {
  const base = aud === 'ocr' ? env('OCR_SERVICE_URL') : env('LEDGER_SERVICE_URL');
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-service-token': signServiceToken(env('INTERNAL_SERVICE_SECRET'), userId, aud),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: (json as { error?: string }).error ?? `status ${res.status}` };
  return json;
}

const cents = (c: number | null, ccy = 'EUR') => (c == null ? null : formatMoney(c / 100, ccy));

/** OpenAI-compatible tool definitions (Groq). Write tools need confirmed=true. */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_receipts',
      description: 'List the user\'s receipts, newest first. Can filter to flagged (doubtful) receipts or a date range.',
      parameters: {
        type: 'object',
        properties: {
          flagged_only: { type: 'boolean' },
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_receipt',
      description: 'Get one receipt with its items, flags and splits.',
      parameters: { type: 'object', properties: { receipt_id: { type: 'string' } }, required: ['receipt_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'correct_receipt',
      description: 'Correct doubtful fields of a receipt. Ask the user to confirm the exact new values first, then call with confirmed=true.',
      parameters: {
        type: 'object',
        properties: {
          receipt_id: { type: 'string' },
          merchant_name: { type: 'string' },
          receipt_date: { type: 'string', description: 'YYYY-MM-DD' },
          total_amount: { type: 'number' },
          vat_amount: { type: 'number' },
          category: { type: 'string', enum: [...CATEGORIES] },
          items_confirmed: { type: 'boolean', description: 'User confirms total is right although items do not add up' },
          confirmed: { type: 'boolean' },
        },
        required: ['receipt_id', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spending_summary',
      description: 'Total spend and spend per category for a date range.',
      parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_balances',
      description: 'Who owes the user money and whom the user owes, plus suggested transfers to settle up.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_groups',
      description: 'List the user\'s groups and their members (ids and names) — needed before splitting.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'split_receipt_equally',
      description: 'Split a receipt equally between group members. The receipt must belong to a group. Confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          receipt_id: { type: 'string' },
          participant_ids: { type: 'array', items: { type: 'string' } },
          confirmed: { type: 'boolean' },
        },
        required: ['receipt_id', 'participant_ids', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'settle_up',
      description: 'Mark all pending debts from a counterparty to the user as paid. Confirm first.',
      parameters: {
        type: 'object',
        properties: { counterparty_id: { type: 'string' }, confirmed: { type: 'boolean' } },
        required: ['counterparty_id', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sync_bank',
      description: 'Fetch recent bank transactions and match them to receipts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Send the user to a page of the app when the action must be done in the UI (upload receipt, connect bank, export or delete account, privacy).',
      parameters: {
        type: 'object',
        properties: { page: { type: 'string', enum: ['/upload', '/receipts', '/splits', '/bank', '/settings/privacy'] } },
        required: ['page'],
      },
    },
  },
] as const;

type Args = Record<string, unknown>;
const needConfirm = { error: 'not_confirmed', hint: 'Ask the user to confirm, then call again with confirmed=true.' };

export async function runTool(name: string, args: Args, userId: string): Promise<unknown> {
  switch (name) {
    case 'list_receipts': {
      let q = db().from('receipts')
        .select('id, merchant_name, receipt_date, total_cents, currency, category, is_flagged, flag_reason, status')
        .eq('user_id', userId).order('receipt_date', { ascending: false, nullsFirst: false })
        .limit(Math.min(Number(args.limit ?? 10), 50));
      if (args.flagged_only) q = q.eq('is_flagged', true);
      if (typeof args.from === 'string') q = q.gte('receipt_date', args.from);
      if (typeof args.to === 'string') q = q.lte('receipt_date', args.to);
      const { data } = await q;
      return (data ?? []).map((r) => ({ ...r, total: cents(r.total_cents, r.currency), total_cents: undefined }));
    }
    case 'get_receipt': {
      const { data } = await db().from('receipts')
        .select('id, merchant_name, receipt_date, total_cents, vat_cents, currency, category, is_flagged, flags, receipt_items(description, price_cents), expense_splits(participant_id, amount_cents, status)')
        .eq('id', String(args.receipt_id)).eq('user_id', userId).maybeSingle();
      return data ?? { error: 'not found' };
    }
    case 'correct_receipt': {
      if (args.confirmed !== true) return needConfirm;
      const { receipt_id, confirmed: _c, ...changes } = args;
      return svc('ocr', '/correct', userId, { method: 'POST', body: { receipt_id, changes } });
    }
    case 'spending_summary': {
      const qs = new URLSearchParams(Object.entries(args).filter(([, v]) => typeof v === 'string') as [string, string][]);
      return svc('ledger', `/summary?${qs}`, userId);
    }
    case 'get_balances':
      return svc('ledger', '/balances', userId);
    case 'list_groups': {
      const { data } = await db().from('group_members')
        .select('groups(id, name, group_members(user_id, profiles(display_name)))')
        .eq('user_id', userId);
      return data ?? [];
    }
    case 'split_receipt_equally':
      if (args.confirmed !== true) return needConfirm;
      return svc('ledger', '/splits', userId, {
        method: 'POST',
        body: { mode: 'equal', receipt_id: args.receipt_id, payer_id: userId, participant_ids: args.participant_ids },
      });
    case 'settle_up':
      if (args.confirmed !== true) return needConfirm;
      return svc('ledger', '/settle', userId, { method: 'POST', body: { counterparty_id: args.counterparty_id } });
    case 'sync_bank':
      return svc('ledger', '/bank/sync', userId, { method: 'POST', body: {} });
    case 'navigate':
      return { navigate_to: args.page };
    default:
      return { error: `unknown tool ${name}` };
  }
}
