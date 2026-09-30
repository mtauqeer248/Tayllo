import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { callService } from '@/lib/services';

/** Enable Banking redirects here with ?code=&state= after the user authorises at their bank. */
export async function GET(req: NextRequest) {
  const sb = await supabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL('/login', req.url));
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) return NextResponse.redirect(new URL('/bank?error=' + encodeURIComponent('Bank authorisation was cancelled.'), req.url));
  try {
    await callService('ledger', '/bank/callback', data.user.id, { method: 'POST', body: { code, state } });
    return NextResponse.redirect(new URL('/bank?ok=' + encodeURIComponent('Bank connected. Tap “Sync now” to match your payments.'), req.url));
  } catch {
    return NextResponse.redirect(new URL('/bank?error=' + encodeURIComponent('Could not connect your bank. Please try again.'), req.url));
  }
}
