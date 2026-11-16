import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Privacy · Signal Watch" };

/** What Signal Watch stores about the people who use it, and how to remove it. Keep in step with lib/tiger.ts. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="November 16, 2026">
      <p>Signal Watch is a free tool run by one person, Taheful Alam. It keeps as little about you as it can. Here is all of it.</p>

      <h2>What is stored</h2>
      <ul>
        <li>
          <strong className="text-zinc-100">A random visitor id</strong> in a cookie, so your watchlist stays yours without an account. It is not linked to your name or email.
        </li>
        <li>
          <strong className="text-zinc-100">If you sign in with Google:</strong> your Google account id, email address and name, and a session cookie. Only a one-way hash of the session token is
          stored. Your watchlist is then saved to the account.
        </li>
        <li>
          <strong className="text-zinc-100">If you sign up for email alerts:</strong> your email address and the tickers you asked about.
        </li>
        <li>
          <strong className="text-zinc-100">If you send feedback:</strong> your message, the page you were on and, only if you typed it, your email.
        </li>
        <li>
          <strong className="text-zinc-100">Usage limits:</strong> a one-way hash of your IP address and a daily count of costly actions, so a public site cannot run up the AI bill. The
          raw address is not stored.
        </li>
        <li>
          <strong className="text-zinc-100">AI call log:</strong> for each AI call, the feature, model, timing, token counts and cost. It does not hold your questions, documents or who you
          are.
        </li>
        <li>
          <strong className="text-zinc-100">Your own Gemini key</strong>, if you add one, stays in your browser. It is sent with your requests and passed to Google, and never stored or logged
          on the server.
        </li>
      </ul>
      <p>
        Questions you ask and documents you add on the Private company page are sent to the AI to answer you and are not saved. Company reports are public data about public companies and are
        shared by everyone who opens them.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>
          <a href="https://vercel.com/legal/privacy-policy">Vercel</a> hosts the site and counts page views without cookies (Vercel Web Analytics).
        </li>
        <li>
          <a href="https://www.tigerdata.com/legal/privacy">Tiger Data</a> hosts the database.
        </li>
        <li>
          <a href="https://policies.google.com/privacy">Google</a> runs sign-in and the Gemini AI, which receives the text of your questions; the{" "}
          <a href="https://ai.google.dev/gemini-api/terms">Gemini API terms</a> apply to it.
        </li>
        <li>
          <a href="https://resend.com/legal/privacy-policy">Resend</a> sends alert emails.
        </li>
      </ul>
      <p>Nothing is sold, and there is no advertising or ad tracking.</p>

      <h2>Removing it</h2>
      <ul>
        <li>Signed in: open the account menu at the top right and choose Delete account. That removes your account, its watchlist and its email alerts at once.</li>
        <li>Email alerts: every alert email has a one-click unsubscribe link.</li>
        <li>Visitor id: clear this site&rsquo;s cookies.</li>
        <li>Anything else: send a request with the Feedback button and it will be handled within 30 days.</li>
      </ul>

      <p>
        See also the <Link href="/terms">Terms</Link>.
      </p>
    </LegalPage>
  );
}
