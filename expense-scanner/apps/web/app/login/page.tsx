import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/logo';
import { done, fail } from '@/lib/flash';
import { Submit } from '@/components/submit';

async function login(formData: FormData) {
  'use server';
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (error) {
    // generic message: never reveal whether an account exists
    if (/confirm/i.test(error.message)) fail('/login', 'Please confirm your email first — check your inbox.');
    fail('/login', 'Email or password is incorrect.');
  }
  done('/dashboard', 'Welcome back 👋');
}

export default async function LoginPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl"><Link href="/" aria-label={`${BRAND.name} home`}><Logo size={36} /></Link></h1>
        <p className="text-sm text-muted">Sign in to your account.</p>
      </div>
      <form action={login} className="space-y-3">
        <input className="input" name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input className="input" name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        <Submit className="btn w-full" pending="Signing in…">Sign in</Submit>
      </form>
      <p className="text-sm text-muted">
        New here? <Link href="/signup" className="text-accent">Create an account</Link> ·{' '}
        <Link href="/privacy" className="text-accent">Privacy</Link>
      </p>
    </div>
  );
}
