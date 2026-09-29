import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/** GDPR Art. 15 / 20 — download all personal data as JSON. */
export async function GET() {
  const sb = await supabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await sb.rpc('export_my_data');
  if (error) return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  return new NextResponse(JSON.stringify({ account: { email: auth.user.email, created_at: auth.user.created_at }, ...data }, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}
