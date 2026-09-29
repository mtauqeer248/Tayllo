import { BRAND } from '@/lib/brand';

/** Tallyo logo: tally-marked receipt icon + wordmark. `iconOnly` hides the name. */
export function Logo({ size = 28, iconOnly = false, className = '' }: { size?: number; iconOnly?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <img src="/icon.svg" alt={iconOnly ? BRAND.name : ''} width={size} height={size} className="shrink-0" />
      {!iconOnly && <span>{BRAND.name}</span>}
    </span>
  );
}
