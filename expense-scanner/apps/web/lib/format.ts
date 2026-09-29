import { formatMoney } from '@es/shared';

export const money = (cents: number | null | undefined, ccy = 'EUR') =>
  cents == null ? '—' : formatMoney(cents / 100, ccy);

export const date = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';
