import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/logo';

async function login(formData: FormData) {
  'use server';
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (error) redirect('/login?error=1'); // generic message: no account enumeration
  redirect('/dashboard');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; check?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl"><Link href="/" aria-label={`${BRAND.name} home`}><Logo size={36} /></Link></h1>
        <p className="text-sm text-muted">Sign in to your account.</p>
      </div>
      {sp.error && <p className="flag">Email or password is incorrect.</p>}
      {sp.check && <p className="card text-sm">Check your email to confirm your account, then sign in.</p>}
      <form action={login} className="space-y-3">
        <input className="input" name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input className="input" name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        <button className="btn w-full">Sign in</button>
      </form>
      <p className="text-sm text-muted">
        New here? <Link href="/signup" className="text-accent">Create an account</Link> ·{' '}
        <Link href="/privacy" className="text-accent">Privacy</Link>
      </p>
    </div>
  );
}
