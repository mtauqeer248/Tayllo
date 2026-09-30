import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import './globals.css';
import { currentUser } from '@/lib/supabase';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/logo';
import { AppNav } from '@/components/nav';
import { Toast } from '@/components/toast';

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.description,
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192' }], apple: '/apple-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const path = (await headers()).get('x-pathname') ?? '';
  const isHome = path === '/';
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        {!isHome && (
          <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
            <nav className="relative mx-auto flex max-w-4xl items-center gap-4 px-4 py-2.5 text-sm">
              <Link href="/" className="text-ink" aria-label={`${BRAND.name} home`}><Logo size={26} /></Link>
              {user ? (
                <AppNav />
              ) : (
                <span className="ml-auto flex items-center gap-4">
                  {path !== '/login' && <Link href="/login" className="whitespace-nowrap text-muted hover:text-ink">Sign in</Link>}
                  {path !== '/signup' && <Link href="/signup" className="btn whitespace-nowrap px-3 py-1.5">Start free</Link>}
                </span>
              )}
            </nav>
          </header>
        )}
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
        <Suspense fallback={null}><Toast /></Suspense>
      </body>
    </html>
  );
}
