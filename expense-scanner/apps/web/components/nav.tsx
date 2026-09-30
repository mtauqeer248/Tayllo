'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  ['/dashboard', 'Home'],
  ['/upload', 'Scan'],
  ['/receipts', 'Receipts'],
  ['/splits', 'Splits'],
  ['/bank', 'Bank'],
  ['/chat', 'Assistant'],
  ['/settings/privacy', 'Settings'],
] as const;

/** Signed-in navigation: inline links on wide screens, a menu button on phones. */
export function AppNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]); // close after navigating

  const link = (href: string, label: string, mobile = false) => {
    const active = path === href || path.startsWith(`${href}/`);
    return (
      <Link key={href} href={href} aria-current={active ? 'page' : undefined}
        className={mobile
          ? `block rounded-lg px-3 py-3 text-base ${active ? 'bg-accent/10 font-medium text-accent' : 'text-ink'}`
          : `whitespace-nowrap ${active ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`}>
        {label}
      </Link>
    );
  };

  return (
    <>
      {/* desktop / tablet */}
      <div className="hidden flex-1 items-center gap-4 md:flex">
        {NAV.map(([h, l]) => link(h, l))}
        <form action="/auth/signout" method="post" className="ml-auto">
          <button className="btn-ghost whitespace-nowrap px-3 py-1.5">Sign out</button>
        </form>
      </div>

      {/* phone */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg border border-line md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <>
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-x-0 bottom-0 top-[57px] z-20 bg-black/30 md:hidden" />
          <div id="mobile-menu" className="absolute inset-x-0 top-full z-30 border-b border-line bg-paper px-4 pb-4 pt-2 shadow-lg md:hidden">
            <nav className="flex flex-col">{NAV.map(([h, l]) => link(h, l, true))}</nav>
            <form action="/auth/signout" method="post" className="mt-2 border-t border-line pt-3">
              <button className="btn-ghost w-full">Sign out</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
