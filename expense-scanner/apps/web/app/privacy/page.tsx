import { POLICY_VERSION } from '@/lib/policy';
import { BRAND } from '@/lib/brand';

export const metadata = { title: `Privacy notice — ${BRAND.name}` };

/** Template privacy notice. Have it reviewed by a lawyer / DPO before launch. */
export default function Privacy() {
  return (
    <article className="prose-sm space-y-4 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">Privacy notice</h1>
      <p className="text-muted">Version {POLICY_VERSION}. [Company name, address, contact email and DPO contact go here.]</p>
      <h2 className="font-semibold">What we process and why</h2>
      <ul className="list-disc pl-5">
        <li><b>Account data</b> (email, name) — to provide the service (Art. 6(1)(b) GDPR).</li>
        <li><b>Receipt images and extracted data</b> — to track and split your expenses (Art. 6(1)(b)); AI reading based on your consent (Art. 6(1)(a)).</li>
        <li><b>Bank transactions</b> (optional) — to match receipts, based on your consent; read-only via a licensed PSD2 provider.</li>
        <li><b>Assistant chats</b> — to answer your questions; deleted after 30 days.</li>
      </ul>
      <h2 className="font-semibold">Where your data lives</h2>
      <p>Database, files and servers are in the EU (Frankfurt). Receipt images are sent to Groq, Inc. (USA) only for reading, under Standard Contractual Clauses with zero data retention. Bank access is provided by Enable Banking Oy (Finland).</p>
      <h2 className="font-semibold">Your rights</h2>
      <p>You can access, export, correct and delete your data at any time from Privacy &amp; data in the app, withdraw consent, and complain to your data protection authority.</p>
      <h2 className="font-semibold">Security</h2>
      <p>Encryption in transit and at rest, per-user access control in the database, no third-party trackers or advertising cookies. Only a strictly necessary login cookie is used.</p>
    </article>
  );
}
