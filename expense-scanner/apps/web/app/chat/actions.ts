'use server';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';

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
  } catch {
    return { reply: 'The assistant is unavailable right now. Please try again in a moment.' };
  }
}

export async function clearHistory() {
  const { user } = await requireUser();
  await callService('chatbot', '/chat', user.id, { method: 'DELETE' });
}
