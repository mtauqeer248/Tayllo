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
  if (!code || !state) return NextResponse.redirect(new URL('/bank?error=Authorisation%20cancelled', req.url));
  try {
    await callService('ledger', '/bank/callback', data.user.id, { method: 'POST', body: { code, state } });
    return NextResponse.redirect(new URL('/bank?connected=1', req.url));
  } catch {
    return NextResponse.redirect(new URL('/bank?error=Could%20not%20connect%20bank', req.url));
  }
}
