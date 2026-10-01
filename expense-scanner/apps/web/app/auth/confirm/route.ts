import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Email confirmation landing page.
 * - token_hash + type: the recommended link for server-rendered apps
 *   ({{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email).
 *   Works even if the email is opened on another device or browser.
 * - code: the default Supabase link (PKCE). Only works in the browser that signed up,
 *   so if it fails we still tell the person their email is confirmed and ask them to sign in.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const next = safePath(url.searchParams.get('next'));
  const sb = await supabase();

  const go = (path: string, key: 'ok' | 'error', msg: string) => {
    const to = new URL(path, url.origin);
    to.searchParams.set(key, msg);
    return NextResponse.redirect(to, { status: 303 });
  };

  if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return go(next, 'ok', 'Email confirmed. Welcome to Tallyo!');
    console.error('[confirm] verifyOtp', error.code, error.message);
    return go('/login', 'error', 'This confirmation link has expired or was already used. Please sign in, or sign up again.');
  }

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return go(next, 'ok', 'Email confirmed. Welcome to Tallyo!');
    console.error('[confirm] exchangeCode', error.code, error.message);
    // Opened in a different browser: the email is usually confirmed anyway — just sign in.
    return go('/login', 'ok', 'Email confirmed. Please sign in.');
  }

  return go('/login', 'error', 'Invalid confirmation link.');
}

/** Only allow internal paths as the destination. */
function safePath(p: string | null): string {
  return p && p.startsWith('/') && !p.startsWith('//') ? p : '/dashboard';
}
