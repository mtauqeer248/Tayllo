'use server';
import { requireUser } from '@/lib/supabase';
import { callService, ServiceError } from '@/lib/services';

const ALLOWED = new Set(['/upload', '/receipts', '/splits', '/bank', '/settings/privacy']);

export async function ask(message: string): Promise<{ reply: string; navigate_to?: string }> {
  const { user } = await requireUser();
  const text = String(message ?? '').trim().slice(0, 2000);
  if (!text) return { reply: '' };
  try {
    const r = await callService<{ reply: string; navigate_to?: string }>('chatbot', '/chat', user.id, {
      method: 'POST', body: { message: text }, timeoutMs: 60_000,
    });
    return { reply: r.reply, navigate_to: r.navigate_to && ALLOWED.has(r.navigate_to) ? r.navigate_to : undefined };
  } catch (e) {
    // Log the real cause in the server terminal / Vercel logs; show a helpful message to the user.
    console.error('[assistant]', e);
    if (e instanceof ServiceError && e.status < 500) {
      if (e.status === 401) return { reply: 'The assistant could not verify this app (service secret mismatch). Check INTERNAL_SERVICE_SECRET is the same everywhere.' };
      return { reply: e.message };
    }
    const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? '')}` : '';
    if (/ECONNREFUSED|fetch failed|not configured/i.test(msg)) {
      return { reply: 'The assistant service is not running or not reachable. Please try again in a moment.' };
    }
    if (/timeout|aborted/i.test(msg)) return { reply: 'The assistant is waking up — please send your message again.' };
    return { reply: 'The assistant is unavailable right now. Please try again in a moment.' };
  }
}

export async function clearHistory() {
  const { user } = await requireUser();
  await callService('chatbot', '/chat', user.id, { method: 'DELETE' });
}
