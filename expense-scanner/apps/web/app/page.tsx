import Link from 'next/link';
import { currentUser } from '@/lib/supabase';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/logo';

export const metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
};

/**
 * Public landing page: explains the problem, how it works and how AI helps.
 * Always public; signed-in users see "Open dashboard" instead of sign-up buttons.
 */
export default async function Home() {
  const signedIn = !!(await currentUser());
  const cta = signedIn
    ? { href: '/dashboard', label: 'Open dashboard' }
    : { href: '/signup', label: 'Create free account' };

  return (
    <div className="landing -my-6">
      {/* ---------- Top bar ---------- */}
      <header className="full-bleed border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label={`${BRAND.name} home`}><Logo size={30} className="text-lg" /></Link>
          <nav className="flex items-center gap-4 text-sm">
            <a href="#how" className="hidden text-muted hover:text-ink sm:inline">How it works</a>
            <a href="#privacy" className="hidden text-muted hover:text-ink sm:inline">Privacy</a>
            {signedIn ? (
              <>
                <form action="/auth/signout" method="post"><button className="text-muted hover:text-ink">Sign out</button></form>
                <Link href="/dashboard" className="btn">Open dashboard</Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-muted hover:text-ink">Sign in</Link>
                <Link href="/signup" className="btn">Start free</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="full-bleed">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div className="space-y-5">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">AI expense tracker · Made for Europe</p>
            <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
              Stop typing receipts.<br />Start knowing where your money goes.
            </h1>
            <p className="text-lg text-muted">
              Take a photo of any receipt or bill. {BRAND.name} reads it, checks the maths, files it, and splits it with
              friends — so you never chase a crumpled receipt or an awkward “who owes what” again.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={cta.href} className="btn px-6 py-3 text-base">{cta.label}</Link>
              <a href="#how" className="btn-ghost px-6 py-3 text-base">See how it works</a>
            </div>
            <p className="text-xs text-muted">Your data stays in the EU · Delete everything with one click · No ads, ever</p>
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* ---------- Problem ---------- */}
      <Section eyebrow="The problem" title="Receipts are small. The hassle isn’t.">
        <div className="grid gap-4 md:grid-cols-3">
          <Pain icon="🧾" title="Paper piles up" text="Receipts fade, get lost in pockets, or end up in a shoebox you only open at tax time." />
          <Pain icon="⌨️" title="Typing is tedious" text="Copying merchant, date, VAT and every line item into a spreadsheet takes minutes per receipt — and mistakes slip in." />
          <Pain icon="🤝" title="Splitting is awkward" text="After a dinner, trip or month of shared groceries, working out who owes whom is slow and easy to get wrong." />
        </div>
      </Section>

      {/* ---------- How it works ---------- */}
      <Section id="how" eyebrow="How it works" title="From photo to organised — in about ten seconds." muted>
        <ol className="grid gap-4 md:grid-cols-4">
          <Step n={1} title="Snap" text="Take a photo with your phone or upload an image. Works with receipts and bills from across Europe." />
          <Step n={2} title="AI reads it" text="Merchant, date, total, VAT and every item are pulled out automatically — decimal commas and all." />
          <Step n={3} title="You confirm" text="Anything that looks wrong is highlighted. Fix it in one tap, or confirm it’s right." />
          <Step n={4} title="Split & track" text="Share it with a group, see spending by category, and match it to your bank payments." />
        </ol>
      </Section>

      {/* ---------- How AI helps ---------- */}
      <Section eyebrow="Where AI helps" title="AI does the boring part. You stay in control.">
        <div className="grid gap-6 md:grid-cols-2">
          <Feature
            title="Reads receipts like a person would"
            text="The AI understands different layouts, languages and formats — “MwSt”, “TVA”, “IVA”, 12,50 € or €12.50 — and turns them into clean data."
          />
          <Feature
            title="Catches mistakes before they cost you"
            text="We never blindly trust the AI. Every total is re-checked: do the items add up? Is the VAT realistic for the EU? Is the date possible? Doubtful fields are flagged for you to check."
          >
            <div className="mt-3 space-y-1.5 text-xs">
              <p className="flag">Items add up to €41.20 but total is €44.20.</p>
              <p className="flag">VAT implies a 38% rate, above the EU maximum of 27%.</p>
            </div>
          </Feature>
          <Feature
            title="Splits bills fairly — to the cent"
            text="Split equally, by item, or with custom amounts. Tax and tips are shared in proportion, and the shares always add up exactly."
          >
            <SplitExample />
          </Feature>
          <Feature
            title="An assistant that knows your expenses"
            text="Just ask. It can find receipts, fix errors, split bills and settle debts — and it always asks before changing anything."
          >
            <ChatExample />
          </Feature>
          <Feature
            title="Matches receipts to your bank"
            text="Optionally connect your bank (read-only, PSD2 regulated). Card payments are matched to receipts automatically, and you see which payments are missing one."
          />
          <Feature
            title="Learns nothing about you it doesn’t need"
            text="Location data is stripped from photos. The AI provider doesn’t keep your images. Your data is never used for advertising."
          />
        </div>
      </Section>

      {/* ---------- Who it's for ---------- */}
      <Section eyebrow="Who it’s for" title="Made for everyday life." muted>
        <div className="grid gap-4 md:grid-cols-4">
          <Persona title="Flatmates" text="Share groceries and bills without a spreadsheet." />
          <Persona title="Travellers" text="Split a trip’s costs fairly, in any EU currency." />
          <Persona title="Freelancers" text="Keep VAT-ready records of every business expense." />
          <Persona title="Families" text="See where the monthly budget actually goes." />
        </div>
      </Section>

      {/* ---------- Privacy ---------- */}
      <Section id="privacy" eyebrow="Privacy by design" title="Your financial data deserves European standards.">
        <div className="grid gap-4 md:grid-cols-3">
          <Trust title="Stored in the EU" text="Database, files and servers are in Frankfurt, Germany." />
          <Trust title="GDPR rights built in" text="Download all your data or delete your account yourself, any time — no emails, no waiting." />
          <Trust title="Only you see your data" text="Strict per-user access rules in the database. Groups see only what you share." />
          <Trust title="Read-only banking" text="Bank access is regulated under PSD2, can’t move money, and expires after 90 days." />
          <Trust title="No trackers, no ads" text="No advertising cookies, no third-party analytics. Just one login cookie." />
          <Trust title="You decide" text="AI processing and bank access are opt-in, and you can withdraw consent in settings." />
        </div>
        <p className="mt-4 text-sm"><Link href="/privacy" className="text-accent">Read the full privacy notice →</Link></p>
      </Section>

      {/* ---------- FAQ ---------- */}
      <Section eyebrow="Questions" title="Good to know" muted>
        <div className="divide-y divide-line rounded-xl border border-line">
          <Faq q="What if the AI reads something wrong?">
            That’s exactly why we built the checks. Suspicious values are highlighted and nothing is final until you’re happy with it. Every correction is saved in the receipt’s history.
          </Faq>
          <Faq q="Which receipts and countries work?">
            Printed receipts, invoices and bills from across Europe, in the common EU languages and currencies. Clear, flat, well-lit photos work best.
          </Faq>
          <Faq q="Do my friends need an account to split with me?">
            Yes. To protect their privacy we don’t store data about people who haven’t signed up. They can create a free account in a minute.
          </Faq>
          <Faq q="Do I have to connect my bank?">
            No. Bank matching is optional. Everything else works without it.
          </Faq>
          <Faq q="Is there a mobile app?">
            Yes — an Android app, and the website works on any phone browser.
          </Faq>
          <Faq q="How do I delete my data?">
            Go to Privacy &amp; data and press “Delete everything”. Your account, receipts, images, splits and bank data are permanently erased.
          </Faq>
        </div>
      </Section>

      {/* ---------- Final CTA ---------- */}
      <section className="full-bleed">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-3xl font-semibold">Your next receipt could be your last one typed by hand.</h2>
          <p className="mt-3 text-muted">Free to start. Takes a minute to set up.</p>
          <Link href={cta.href} className="btn mt-6 px-8 py-3 text-base">{cta.label}</Link>
        </div>
      </section>

      <footer className="full-bleed border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted">
          <span className="flex items-center gap-2"><Logo size={18} iconOnly /> © {new Date().getFullYear()} {BRAND.name} · Hosted in the EU</span>
          <span className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/login">Sign in</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ================= Building blocks ================= */

function Section({ id, eyebrow, title, muted, children }: {
  id?: string; eyebrow: string; title: string; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <section id={id} className={`full-bleed scroll-mt-16 ${muted ? 'bg-line/30' : ''}`}>
      <div className="mx-auto max-w-5xl px-4 py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">{eyebrow}</p>
        <h2 className="mb-8 mt-2 text-2xl font-semibold md:text-3xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Pain({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card space-y-2">
      <p className="text-2xl" aria-hidden>{icon}</p>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="card space-y-2 bg-paper">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{n}</span>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </li>
  );
}

function Feature({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="card">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
      {children}
    </div>
  );
}

function Persona({ title, text }: { title: string; text: string }) {
  return (
    <div className="card bg-paper">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

function Trust({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-accent" aria-hidden>✓</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
        {q}<span className="text-muted transition group-open:rotate-45">+</span>
      </summary>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </details>
  );
}

/* ================= Illustrations (pure HTML, no images) ================= */

function HeroDemo() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-label="Example: a receipt turned into structured data">
      {/* paper receipt */}
      <div className="rotate-[-3deg] rounded-md border border-line bg-white p-4 font-mono text-[11px] leading-5 text-neutral-700 shadow-sm">
        <p className="text-center font-bold">BÄCKEREI MÜLLER</p>
        <p className="text-center">Hauptstr. 12 · Berlin</p>
        <p className="text-center">14.09.2026 08:41</p>
        <hr className="my-2 border-dashed border-neutral-300" />
        <p className="flex justify-between"><span>2x Brötchen</span><span>1,20</span></p>
        <p className="flex justify-between"><span>Croissant</span><span>1,90</span></p>
        <p className="flex justify-between"><span>Cappuccino</span><span>3,40</span></p>
        <hr className="my-2 border-dashed border-neutral-300" />
        <p className="flex justify-between font-bold"><span>SUMME EUR</span><span>6,50</span></p>
        <p className="flex justify-between"><span>MwSt 7%</span><span>0,43</span></p>
      </div>
      {/* extracted card */}
      <div className="card relative -mt-3 ml-8 rotate-[2deg] bg-paper shadow-lg">
        <p className="label">Read by AI · checked ✓</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Merchant</dt><dd>Bäckerei Müller</dd>
          <dt className="text-muted">Date</dt><dd>14 Sep 2026</dd>
          <dt className="text-muted">Total</dt><dd className="font-semibold">€6.50</dd>
          <dt className="text-muted">VAT</dt><dd>€0.43</dd>
          <dt className="text-muted">Category</dt><dd>Restaurants</dd>
        </dl>
      </div>
    </div>
  );
}

function SplitExample() {
  const rows: [string, string, string][] = [
    ['Anna', 'Pasta, wine', '€31.40'],
    ['Ben', 'Pizza', '€19.10'],
    ['You', 'Salad, dessert, wine', '€34.10'],
  ];
  return (
    <div className="mt-3 rounded-lg border border-line text-xs">
      <p className="border-b border-line px-3 py-2 text-muted">Dinner at Trattoria Roma · €84.60 incl. tip</p>
      {rows.map(([who, what, amt]) => (
        <p key={who} className="flex justify-between px-3 py-1.5"><span><b>{who}</b> <span className="text-muted">{what}</span></span><span>{amt}</span></p>
      ))}
    </div>
  );
}

function ChatExample() {
  return (
    <div className="mt-3 space-y-2 text-xs">
      <p className="ml-auto w-fit max-w-[85%] rounded-xl bg-accent px-3 py-2 text-white">How much did I spend on groceries in September?</p>
      <p className="w-fit max-w-[85%] rounded-xl border border-line px-3 py-2">€312.40 across 14 receipts — about €40 less than August. Two receipts still need checking. Want to see them?</p>
    </div>
  );
}
