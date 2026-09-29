import { requireUser } from '@/lib/supabase';
import { Chat } from './chat';

export default async function ChatPage() {
  const { sb } = await requireUser();
  const { data } = await sb.from('chat_messages').select('role, content').order('created_at', { ascending: false }).limit(20);
  const initial = (data ?? []).reverse() as { role: 'user' | 'assistant'; content: string }[];
  return <Chat initial={initial} />;
}
