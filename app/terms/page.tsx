import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Terms · Signal Watch" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 16, 2026">
      <p>By using Signal Watch you agree to these terms. They are short on purpose.</p>

      <h2>Not investment advice</h2>
      <p>
        Signal Watch estimates credit risk from public filings, market prices and news, partly with AI. Nothing on it is investment, legal, tax or credit advice, or a recommendation to buy,
        sell or hold anything. Estimates can be wrong, out of date or incomplete, and AI-written text can misread a filing even after it is checked. Check the original filings, linked on every
        report, before you act, and talk to a qualified professional about your own situation.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided as it is, free, with no promise that it is accurate, complete or always available. To the fullest extent the law allows, its author is not liable for any loss from
        using it or relying on it.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>Free use has daily limits, because every analysis costs real money. Do not get around them with scripts or many identities.</li>
        <li>Do not attack, overload or scrape the site, or use it to break the law.</li>
        <li>If you add your own Gemini key, Google bills your calls to you under its own terms.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        What you type or add stays yours. You allow the site to process it to answer you, as described in the <Link href="/privacy">Privacy</Link> page.
      </p>

      <h2>Sources</h2>
      <p>
        Filings come from the SEC&rsquo;s EDGAR system and market data from public sources. Each belongs to its publisher, and their terms apply.
      </p>

      <h2>Changes</h2>
      <p>These terms may change as the site does. The date above shows the last change. Questions go through the Feedback button.</p>
    </LegalPage>
  );
}
