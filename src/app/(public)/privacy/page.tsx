import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/public/legal-page";
import { getSiteSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Privacy notice" };

export default async function PrivacyPage() {
  const s = await getSiteSettings();
  const r = s.retention as Record<string, number>;
  const who = s.legalName ?? s.companyName;
  const contact = s.supportEmail ? <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> : <Link href="/support">our support form</Link>;
  return (
    <LegalPage eyebrow="Privacy" title="Privacy notice" updated="19 October 2026">
      <section>
        <h2>Who we are</h2>
        <p>This service is run by {who}. This notice explains what information the part-check service uses, why, and for how long. Questions or requests: {contact}.</p>
      </section>
      <section>
        <h2>When you check a code</h2>
        <p>You don't need an account. When a code is checked we record:</p>
        <ul>
          <li>the result and the time of the check;</li>
          <li>the type of device (for example "iPhone" or "Android"), not the exact model or any device ID;</li>
          <li>a coarse, one-way fingerprint of your network (made from the first part of your IP address with a secret key, so it can't be turned back into an address or used to identify you), and, where our hosting provider supplies it, your country;</li>
          <li>which part the code belongs to, if it matched one.</li>
        </ul>
        <p>We do <strong>not</strong> store your IP address, ask for your name, or set cookies or tags for advertising or tracking. The code in the web address is removed from your browser's address bar as soon as the page opens and isn't stored in your browser.</p>
        <p><strong>Why:</strong> to give you a result, to keep the service reliable and secure, and to spot unusual patterns (for example, one code checked from many places) so staff can look into possible counterfeits. Unusual patterns are reviewed by a person; they aren't treated as proof of wrongdoing.</p>
        <p><strong>How long:</strong> the network fingerprint and country are removed after {r.verificationNetworkDays ?? 90} days. The result, time and part reference are kept as a record of the part's history.</p>
      </section>
      <section>
        <h2>When you contact support</h2>
        <p>The details you give us (such as your name, email, phone, the serial number and your message) are used only to respond to you and to look into the part you asked about. If you report a possible counterfeit, relevant details may be shared with the team investigating it. Support cases are anonymised {r.supportCaseDays ?? 365} days after they are created, once resolved.</p>
      </section>
      <section>
        <h2>Who sees it</h2>
        <p>Only authorised staff, according to their role. Our hosting and database providers process data on our behalf. We don't sell your information or share it for marketing.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>You can ask us what we hold about a support case, to correct it, or to delete it, by contacting {contact}. Network fingerprints can't be linked back to you, so we can't look them up by person.</p>
      </section>
    </LegalPage>
  );
}
