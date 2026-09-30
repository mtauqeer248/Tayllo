import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyServiceToken, type ServiceClaims } from '@es/shared/service-auth';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env var ${name}`);
  return v;
}

let admin: SupabaseClient | null = null;
/** Service-role client. Every query MUST be scoped by the verified userId. */
export function db(): SupabaseClient {
  admin ??= createClient(env('SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export async function audit(userId: string, action: string, entity?: string, entityId?: string) {
  await db().from('audit_log').insert({ user_id: userId, action, entity, entity_id: entityId ?? null });
}

/**
 * Create a Fastify service that only accepts calls signed by the web gateway.
 * Logs never include request bodies (they may contain personal data).
 */
export async function createService(aud: ServiceClaims['aud']): Promise<FastifyInstance> {
  const secret = env('INTERNAL_SERVICE_SECRET');
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers["x-service-token"]'],
    },
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: true,
  });
  await app.register(helmet);
  await app.register(rateLimit, {
    hook: 'preHandler', // runs after auth so the key is the user, not the gateway IP
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req as FastifyRequest).userId || req.ip,
  });

  app.decorateRequest('userId', '');
  app.get('/healthz', async () => ({ ok: true, service: aud }));

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    const claims = verifyServiceToken(secret, req.headers['x-service-token'] as string | undefined, aud);
    if (!claims) return reply.code(401).send({ error: 'unauthorized' });
    req.userId = claims.sub;
  });

  app.setErrorHandler((error, req, reply) => {
    const err = error as { name?: string; message?: string; statusCode?: number; code?: string };
    if (err.name === 'ZodError') return reply.code(400).send({ error: 'invalid_request' });
    req.log.error({ err: { message: err.message, code: err.code } }, 'request failed');
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    // in development, show the real reason so problems are easy to fix; production stays generic
    const hide = status === 500 && process.env.NODE_ENV === 'production';
    return reply.code(status).send({ error: hide ? 'internal_error' : err.message });
  });

  return app;
}

export async function start(app: FastifyInstance, defaultPort: number) {
  const port = Number(process.env.PORT ?? defaultPort);
  await app.listen({ port, host: '0.0.0.0' });
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

/**
 * Startup self-check (non-blocking): verifies the Groq key once and logs a clear,
 * masked result — so a bad key shows up in the service log (terminal / Render) immediately.
 */
export async function checkGroqKey(app: FastifyInstance): Promise<void> {
  const k = process.env.GROQ_API_KEY ?? '';
  const masked = k ? `${k.slice(0, 4)}…${k.slice(-4)} (${k.length} chars)` : 'MISSING';
  if (!k) { app.log.error('Groq key MISSING — set GROQ_API_KEY'); return; }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { authorization: `Bearer ${k}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) app.log.info(`Groq key OK: ${masked}`);
    else if (res.status === 401) app.log.error(`Groq key REJECTED (Invalid API Key): ${masked} — create a new one at console.groq.com/keys`);
    else app.log.warn(`Groq key check returned HTTP ${res.status}: ${masked}`);
  } catch (e) {
    app.log.warn(`Groq key check skipped (network: ${(e as Error).message}): ${masked}`);
  }
}
