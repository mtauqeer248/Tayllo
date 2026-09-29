import 'server-only';
import { signServiceToken } from '@es/shared/service-auth';

type Aud = 'ocr' | 'ledger' | 'chatbot';
const BASE: Record<Aud, string | undefined> = {
  ocr: process.env.OCR_SERVICE_URL,
  ledger: process.env.LEDGER_SERVICE_URL,
  chatbot: process.env.CHATBOT_SERVICE_URL,
};

export class ServiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Gateway -> microservice call. The user id comes from the verified Supabase session,
 * never from the client, and is carried in a 60-second HMAC token.
 */
export async function callService<T = unknown>(
  aud: Aud,
  path: string,
  userId: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const base = BASE[aud];
  if (!base) throw new ServiceError(500, `${aud} service URL not configured`);
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-service-token': signServiceToken(process.env.INTERNAL_SERVICE_SECRET!, userId, aud),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(init.timeoutMs ?? 45_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ServiceError(res.status, json.error ?? `service error ${res.status}`);
  return json;
}
