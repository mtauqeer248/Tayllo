'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Msg = { kind: 'ok' | 'error'; text: string };

/** Shows ?ok= / ?error= messages as a toast, then cleans the URL. */
export function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    const ok = params.get('ok');
    const error = params.get('error');
    if (!ok && !error) return;
    setMsg(error ? { kind: 'error', text: error } : { kind: 'ok', text: ok! });
    const rest = new URLSearchParams(params);
    rest.delete('ok');
    rest.delete('error');
    const q = rest.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'error' ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;
  const isErr = msg.kind === 'error';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div
        role={isErr ? 'alert' : 'status'}
        className={`toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${isErr ? 'bg-bad text-white' : 'bg-accent text-white'}`}
      >
        <span aria-hidden className="mt-0.5 font-bold">{isErr ? '!' : '✓'}</span>
        <span className="flex-1">{msg.text}</span>
        <button onClick={() => setMsg(null)} aria-label="Dismiss" className="opacity-80 hover:opacity-100">✕</button>
      </div>
    </div>
  );
}
