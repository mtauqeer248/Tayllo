import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Service-to-service auth: the web gateway signs a short-lived token carrying the
 * authenticated user id. Services verify it and act on behalf of that user only.
 * Format: base64url(payload).base64url(hmac-sha256)
 */
export interface ServiceClaims {
  sub: string; // user id
  aud: 'ocr' | 'ledger' | 'chatbot';
  iat: number;
  exp: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signServiceToken(
  secret: string,
  sub: string,
  aud: ServiceClaims['aud'],
  ttlSeconds = 60,
  now = Math.floor(Date.now() / 1000),
): string {
  if (!secret || secret.length < 32) throw new Error('INTERNAL_SERVICE_SECRET must be at least 32 chars');
  const payload = b64u(JSON.stringify({ sub, aud, iat: now, exp: now + ttlSeconds } satisfies ServiceClaims));
  const sig = b64u(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyServiceToken(
  secret: string,
  token: string | undefined,
  aud: ServiceClaims['aud'],
  now = Math.floor(Date.now() / 1000),
): ServiceClaims | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ServiceClaims;
    if (claims.aud !== aud || claims.exp < now || typeof claims.sub !== 'string') return null;
    return claims;
  } catch {
    return null;
  }
}
