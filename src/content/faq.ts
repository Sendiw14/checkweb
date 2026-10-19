export type Faq = { id: string; q: string; a: string };

/** All FAQ wording in one reviewable place. Keep claims limited to what the system actually does. */
export function faqs(company: string): Faq[] {
  return [
    {
      id: "what-is-checked",
      q: "What exactly does the check tell me?",
      a: `It tells you whether the code you scanned matches a record issued by ${company}, and what that record says: whether the part has been released for sale, put on hold, withdrawn, or covered by a recall, and whether the code has been checked before. It does not inspect the part itself.`,
    },
    {
      id: "genuine",
      q: "Does a recognized code prove my part is genuine?",
      a: "No. A recognized code is a strong sign, because the codes are random, unique to each part, and can only be created by the manufacturer. But a label can in principle be copied onto another item, so the check is one piece of evidence alongside the part's appearance, its packaging and where you bought it. If anything looks wrong, contact us.",
    },
    {
      id: "checked-before",
      q: "The result says my code was checked before. Is something wrong?",
      a: "Not necessarily. Retailers, workshops and previous owners may all have scanned the same code. We show when it was first checked so you can judge whether that fits what you know. If it doesn't, tell us. We never assume it was your doing.",
    },
    {
      id: "no-match",
      q: "It says it can't match my code. What now?",
      a: "Check for typing mistakes or scan the QR code again in good light. If you typed the code, the characters 0 and O, and 1 and I, are easy to mix up; we accept either. If it still can't be matched and the part is something you bought, please contact us. We'd like to know.",
    },
    {
      id: "qr-damaged",
      q: "The QR code is scratched or won't scan.",
      a: "Use the backup code printed next to or under the QR code. It's 20 letters and numbers, grouped in fives of four, such as ABCD-EFGH-JKMN-PQRS-TVWX. Capital letters, dashes and spaces don't matter.",
    },
    {
      id: "app-account",
      q: "Do I need an app or an account?",
      a: "No. Your phone's normal camera app recognizes the QR code and offers a link. Tapping it opens this website in your browser.",
    },
    {
      id: "privacy",
      q: "What do you keep when I check a code?",
      a: "We record the result, the time, the type of device (for example iPhone or Android), and a one-way, coarse fingerprint of your network so we can spot unusual patterns across many checks. We don't store your IP address or ask who you are, and your browser doesn't keep the code. See the privacy notice for details and retention periods.",
    },
    {
      id: "recall",
      q: "What if the result mentions a recall?",
      a: `${company} publishes the recall instructions that apply to your part on the result page, exactly as approved by the company. Follow them, and contact support if you need help.`,
    },
    {
      id: "how-codes-work",
      q: "How do the codes work?",
      a: "Each part is given its own random secret code when it is made. We store only a one-way fingerprint of it, so even our own database does not contain the codes themselves. When you scan, we fingerprint what you sent and look for a match.",
    },
  ];
}

export const FAQ_HIGHLIGHTS = (company: string): Faq[] => {
  const all = faqs(company);
  return ["genuine", "checked-before", "qr-damaged", "privacy"].map((id) => all.find((f) => f.id === id)!);
};
