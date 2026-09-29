import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { POLICY_VERSION } from '@/lib/policy';
import { Logo } from '@/components/logo';

const Schema = z.object({
  display_name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(10, 'Use at least 10 characters'),
  terms: z.literal('on'),
  ai_processing: z.literal('on'),
  marketing: z.literal('on').optional(),
});

async function signup(formData: FormData) {
  'use server';
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/signup?error=1');
  const v = parsed.data;
  const sb = await supabase();
  const { error } = await sb.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${process.env.APP_URL}/login?check=1`,
      data: {
        display_name: v.display_name,
        policy_version: POLICY_VERSION,
        consents: { terms: true, privacy: true, ai_processing: true, marketing: v.marketing === 'on' },
      },
    },
  });
  if (error) redirect('/signup?error=1');
  redirect('/login?check=1');
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-12 max-w-sm space-y-6">
      <Link href="/" aria-label="Home"><Logo size={36} className="text-2xl" /></Link>
      <h1 className="text-2xl font-semibold">Create account</h1>
      {sp.error && <p className="flag">Please check the form: password 10+ characters and the required boxes ticked.</p>}
      <form action={signup} className="space-y-3">
        <input className="input" name="display_name" placeholder="Your name" required maxLength={80} />
        <input className="input" name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input className="input" name="password" type="password" placeholder="Password (10+ characters)" autoComplete="new-password" minLength={10} required />
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="terms" required /> <span>I accept the terms and the <Link href="/privacy" className="text-accent">privacy notice</Link>.</span>
        </label>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="ai_processing" required />
          <span>I agree that receipt images are processed by an AI model (Groq) to extract the data. Images are not stored by the AI provider.</span>
        </label>
        <label className="flex gap-2 text-sm text-muted">
          <input type="checkbox" name="marketing" /> <span>Optional: product update emails.</span>
        </label>
        <button className="btn w-full">Create account</button>
      </form>
      <p className="text-sm text-muted">Already have an account? <Link href="/login" className="text-accent">Sign in</Link></p>
    </div>
  );
}
