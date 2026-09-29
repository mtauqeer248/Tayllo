import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';

/** Per-request Supabase client acting as the logged-in user (RLS enforced). */
export async function supabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — the proxy refreshes cookies instead */
        }
      },
    },
  });
}

export interface SessionUser { id: string; email?: string }

/**
 * The signed-in user, verified from the JWT signature (getClaims). With Supabase's
 * asymmetric signing keys this is checked locally — no network round trip — and
 * cache() makes layout + page share one check per request.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const sb = await supabase();
  const { data, error } = await sb.auth.getClaims();
  const c = data?.claims;
  if (error || !c?.sub) return null;
  return { id: c.sub, email: typeof c.email === 'string' ? c.email : undefined };
});

/** Returns the verified user or redirects to /login. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return { sb: await supabase(), user };
}
