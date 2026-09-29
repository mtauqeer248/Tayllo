'use client';
import { useFormStatus } from 'react-dom';

export function Submit({ children, pending = 'Working…', className = 'btn' }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} disabled={isPending} aria-busy={isPending}>
      {isPending ? pending : children}
    </button>
  );
}
