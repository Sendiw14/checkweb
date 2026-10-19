import type { Metadata } from "next";
import { getSiteSettings } from "@/server/settings";
import { VerifyExperience } from "@/components/public/verify-experience";

export const metadata: Metadata = {
  title: "Check a part",
  // Result pages are personal to the scan: keep them out of search engines and previews.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyPage() {
  const s = await getSiteSettings();
  return (
    <>
      <noscript>
        <div className="mx-auto max-w-xl px-4 py-10 text-center">
          <h1 className="text-title">JavaScript is needed to check a code</h1>
          <p className="mt-3 text-body">
            To keep your code out of web addresses and server logs, the check runs in your browser. Please enable JavaScript and scan again, or contact {s.companyName} support.
          </p>
        </div>
      </noscript>
      <VerifyExperience contact={{ company: s.companyName, supportEmail: s.supportEmail, supportPhone: s.supportPhone }} />
    </>
  );
}
