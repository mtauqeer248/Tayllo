import 'server-only';
import { redirect } from 'next/navigation';
import { ServiceError } from '@/lib/services';

/**
 * Flash messages for server actions: redirect back with ?ok= or ?error=,
 * which the <Toast /> in the root layout shows and then removes from the URL.
 * Call these OUTSIDE try/catch (redirect works by throwing).
 */
function withParam(path: string, key: 'ok' | 'error', text: string) {
  const [base, query = ''] = path.split('?');
  const qs = new URLSearchParams(query);
  qs.delete('ok');
  qs.delete('error');
  qs.set(key, text.slice(0, 200));
  return `${base}?${qs}`;
}

export function done(path: string, message: string): never {
  redirect(withParam(path, 'ok', message));
}

export function fail(path: string, message: string): never {
  redirect(withParam(path, 'error', message));
}

/** A user-safe error message: service validation messages pass through, internal errors don't. */
export function errorText(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const dev = process.env.NODE_ENV !== 'production';
  if (e instanceof ServiceError) {
    if (e.status === 503 || e.status >= 500) {
      return dev ? `Service error ${e.status}: ${e.message}` : 'The service is unavailable right now. Please try again in a moment.';
    }
    return e.message.charAt(0).toUpperCase() + e.message.slice(1);
  }
  if (e instanceof Error && /fetch failed|ECONNREFUSED|timeout|aborted/i.test(e.message)) {
    if (dev) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      return cause === 'ECONNREFUSED'
        ? 'A service is not running (connection refused). Restart npm run dev.'
        : `Service did not answer: ${e.message}`;
    }
    return 'The service is unavailable right now. Please try again in a moment.';
  }
  return fallback;
}
