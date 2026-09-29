import { createSign, randomUUID } from 'node:crypto';
import { env } from '@es/service-kit';

/**
 * Minimal Enable Banking (PSD2 AIS) client.
 * Docs: https://enablebanking.com/docs/api/reference/
 * Auth: every request carries a short-lived RS256 JWT signed with the app's private key,
 * with the application id as `kid`.
 */
const API = 'https://api.enablebanking.com';

function jwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ typ: 'JWT', alg: 'RS256', kid: env('ENABLE_BANKING_APP_ID') });
  const payload = b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 300 });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(env('ENABLE_BANKING_PRIVATE_KEY_PEM').replace(/\\n/g, '\n')).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${jwt()}`, 'content-type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Enable Banking ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export interface Aspsp { name: string; country: string; logo?: string }

export async function listBanks(country: string): Promise<Aspsp[]> {
  const r = await call<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
  return r.aspsps.map(({ name, country, logo }) => ({ name, country, logo }));
}

/** Start consent. Returns the bank's redirect URL. PSD2 consent max = 180 days; we ask for 90. */
export async function startAuthorization(aspsp: { name: string; country: string }, state: string) {
  const validUntil = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const r = await call<{ url: string; authorization_id: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp,
      state,
      redirect_url: env('ENABLE_BANKING_REDIRECT_URL'),
      psu_type: 'personal',
    }),
  });
  return { url: r.url, validUntil };
}

export async function createSession(code: string) {
  return call<{ session_id: string; accounts: { uid: string }[]; access: { valid_until: string } }>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function deleteSession(sessionId: string) {
  await call(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => undefined);
}

export interface EbTransaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: 'DBIT' | 'CRDT';
  booking_date?: string;
  value_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
}

export async function fetchTransactions(accountUid: string, dateFrom: string): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let key: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ date_from: dateFrom, ...(key ? { continuation_key: key } : {}) });
    const r = await call<{ transactions: EbTransaction[]; continuation_key?: string }>(
      `/accounts/${encodeURIComponent(accountUid)}/transactions?${q}`,
    );
    out.push(...r.transactions);
    if (!r.continuation_key) break;
    key = r.continuation_key;
  }
  return out;
}

export const newState = () => randomUUID();
