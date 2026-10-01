import Link from 'next/link';
import { headers } from 'next/headers';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { POLICY_VERSION } from '@/lib/policy';
import { Logo } from '@/components/logo';
import { done, fail } from '@/lib/flash';
import { Submit } from '@/components/submit';

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
  if (!parsed.success) fail('/signup', 'Please check the form: a password of 10+ characters and the two required boxes ticked.');
  const v = parsed.data;
  const sb = await supabase();
  // Where the confirmation email sends people back to: APP_URL, or else the site the form was sent from.
  const h = await headers();
  const origin = process.env.APP_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const { error } = await sb.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      data: {
        display_name: v.display_name,
        policy_version: POLICY_VERSION,
        consents: { terms: true, privacy: true, ai_processing: true, marketing: v.marketing === 'on' },
      },
    },
  });
  if (error) {
    console.error('[signup]', error.status, error.code, error.message);
    fail('/signup', signupError(error.code, error.message));
  }
  done('/login', 'Account created. Check your email to confirm it, then sign in.');
}

/** Supabase auth messages are safe to show; map the common ones to plain language. */
function signupError(code: string | undefined, message: string): string {
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return 'Too many sign-ups in a short time. Please try again in an hour.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) return 'This email already has an account. Please sign in.';
  if (/password/i.test(message)) return message;
  if (/database error/i.test(message)) return 'Could not set up your account (database). Please try again later.';
  if (/email/i.test(message)) return message;
  return 'Could not create the account. Please try again.';
}

export default async function SignupPage() {
  return (
    <div className="mx-auto mt-12 max-w-sm space-y-6">
      <Link href="/" aria-label="Home"><Logo size={36} className="text-2xl" /></Link>
      <h1 className="text-2xl font-semibold">Create account</h1>
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
        <Submit className="btn w-full" pending="Creating account…">Create account</Submit>
      </form>
      <p className="text-sm text-muted">Already have an account? <Link href="/login" className="text-accent">Sign in</Link></p>
    </div>
  );
}
