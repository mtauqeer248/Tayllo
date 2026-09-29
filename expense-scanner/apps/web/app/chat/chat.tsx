'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ask, clearHistory } from './actions';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Which receipts need checking?',
  'How much did I spend on groceries this month?',
  'Who owes me money?',
  'Split my last receipt equally with the flat group',
];

export function Chat({ initial }: { initial: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    if (!text.trim() || pending) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    start(async () => {
      const r = await ask(text);
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply }]);
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: 'smooth' }));
      if (r.navigate_to) router.push(r.navigate_to);
      else router.refresh();
    });
  };

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Ask me anything about your expenses. I can fix flagged receipts, split bills and settle up — I&apos;ll always ask before changing anything.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="btn-ghost text-xs">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-auto max-w-[85%] rounded-xl bg-accent px-3 py-2 text-sm text-white' : 'max-w-[85%] whitespace-pre-wrap rounded-xl border border-line px-3 py-2 text-sm'}>
            {m.content}
          </div>
        ))}
        {pending && <div className="text-sm text-muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-line pt-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} className="input" placeholder="Message" maxLength={2000} aria-label="Message" />
        <button className="btn" disabled={pending}>Send</button>
      </form>
      <button onClick={() => start(async () => { await clearHistory(); setMsgs([]); })} className="mt-2 self-end text-xs text-muted">Clear history</button>
    </div>
  );
}
