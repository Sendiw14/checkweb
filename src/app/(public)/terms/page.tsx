import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/public/legal-page";
import { getSiteSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Terms of use" };

export default async function TermsPage() {
  const s = await getSiteSettings();
  const who = s.legalName ?? s.companyName;
  return (
    <LegalPage eyebrow="Terms" title="Terms of use" updated="19 October 2026">
      <section>
        <h2>What this service is</h2>
        <p>This website lets you check whether a code on a {s.companyName} part matches a record issued by {who}, and shows what that record says. It's provided to help you make informed decisions about parts.</p>
      </section>
      <section>
        <h2>What a result means</h2>
        <p>A recognized code shows that a record exists and what its status is. It is not a warranty or a guarantee that the physical item in your hands is genuine, safe or fit for a particular use, because a label can in principle be copied. Please use your own judgement, and contact us if anything looks wrong.</p>
      </section>
      <section>
        <h2>Please don't</h2>
        <ul>
          <li>try to guess codes, or use scripts or bots to submit large numbers of codes;</li>
          <li>interfere with or overload the service, or try to access anything that isn't meant for you;</li>
          <li>present a result as an official certificate or warranty of authenticity.</li>
        </ul>
        <p>We limit how quickly codes can be checked, and may block activity that looks automated or abusive.</p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>We aim to keep the service available, but it may sometimes be unavailable. When it is, it says so, and a missing result never means a part is invalid.</p>
      </section>
      <section>
        <h2>Recalls and safety</h2>
        <p>Recall and safety instructions shown on a result are the text approved by {who}. Follow them and contact support if you need help.</p>
      </section>
      <section>
        <h2>Contact and changes</h2>
        <p>Questions about these terms: <Link href="/support">contact support</Link>. We may update these terms; the version and date are shown above. Nothing in these terms limits rights you have under consumer law.</p>
      </section>
    </LegalPage>
  );
}
