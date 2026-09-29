import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const sb = await supabase();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL('/', req.url), { status: 303 }); // back to the homepage
}
