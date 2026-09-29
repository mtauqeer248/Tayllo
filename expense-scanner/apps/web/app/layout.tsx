import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import './globals.css';
import { currentUser } from '@/lib/supabase';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/logo';

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.description,
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192' }], apple: '/apple-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e' };

const NAV = [
  ['/dashboard', 'Home'],
  ['/upload', 'Scan'],
  ['/receipts', 'Receipts'],
  ['/splits', 'Splits'],
  ['/bank', 'Bank'],
  ['/chat', 'Assistant'],
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const path = (await headers()).get('x-pathname') ?? '';
  const isHome = path === '/';
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        {!isHome && (
          <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
            <nav className="mx-auto flex max-w-4xl items-center gap-4 overflow-x-auto px-4 py-3 text-sm">
              <Link href="/" className="text-ink" aria-label={`${BRAND.name} home`}><Logo size={24} /></Link>
              {user ? (
                <>
                  {NAV.map(([href, label]) => (
                    <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}
                      className="whitespace-nowrap text-muted hover:text-ink aria-[current=page]:font-medium aria-[current=page]:text-ink">{label}</Link>
                  ))}
                  <span className="ml-auto flex items-center gap-4">
                    <Link href="/settings/privacy" className="whitespace-nowrap text-muted hover:text-ink">Settings</Link>
                    <form action="/auth/signout" method="post">
                      <button className="btn-ghost whitespace-nowrap px-3 py-1.5">Sign out</button>
                    </form>
                  </span>
                </>
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
      </body>
    </html>
  );
}
