import type { PublicVerification, PublicStatus } from "@/lib/verification-types";
import { formatDate } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "neutral" | "brand";
export type IconKey = "shield-check" | "shield-alert" | "shield-x" | "siren" | "pause" | "clock" | "archive" | "search-x" | "scan" | "wifi-off" | "timer" | "circle-alert";

export type StatusCopy = {
  tone: Tone;
  icon: IconKey;
  heading: string;
  /** One or two sentences, plain language. */
  lead: string;
  /** Optional second paragraph with the "what to do" guidance. */
  next?: string;
  /** Short chip shown next to the heading (e.g. "Checked before"). */
  chip?: string;
  /** Which call-to-action leads. */
  primary: "another" | "support" | "report" | "retry" | "none";
  /** Screen readers announce `live: assertive` for hazards. */
  live: "polite" | "assertive";
};

/**
 * All customer-facing wording lives here, in one reviewable file, so legal / quality
 * teams can approve it and translators have one place to work. Principles:
 *  - say what the system actually established, nothing more;
 *  - never accuse the customer of anything;
 *  - a recognised code is evidence, not proof of physical authenticity;
 *  - recall wording is never generated: it is the text staff approved.
 */
export function copyFor(v: PublicVerification, company: string): StatusCopy {
  const s: PublicStatus = v.status;
  const first = v.firstVerifiedAt ? formatDate(v.firstVerifiedAt) : null;
  const n = v.previousScanCount ?? 0;

  switch (s) {
    case "recognized_first":
      return {
        tone: "success", icon: "shield-check", live: "polite", primary: "another",
        heading: "Code recognized",
        lead: `This code matches a record issued by ${company}. It is being checked for the first time.`,
        next: "A recognized code is a strong sign, but it can't see the part itself. If the part or its packaging looks wrong, please contact us.",
      };
    case "recognized_repeat":
      return {
        tone: "success", icon: "shield-check", live: "polite", primary: "another", chip: "Checked before",
        heading: "Code recognized",
        lead: `This code matches a record issued by ${company}. It was first checked${first ? ` on ${first}` : " earlier"} and has been checked ${n === 1 ? "once" : `${n} times`} since.`,
        next: "Codes can be checked more than once: by a retailer, a workshop, or you. If you didn't expect that, let us know and we'll take a look.",
      };
    case "suspicious":
      return {
        tone: "warning", icon: "shield-alert", live: "polite", primary: "report", chip: "Checked many times",
        heading: "Code recognized, with a note",
        lead: `This code matches a record issued by ${company}, but it has been checked more often, or from more places, than we normally see for a single part.`,
        next: "That can have ordinary explanations, such as stock being scanned by a retailer or workshop. If you're unsure where this part came from, tell us and we'll look into it. You've done nothing wrong by checking.",
      };
    case "recalled":
      return {
        tone: "danger", icon: "siren", live: "assertive", primary: "support",
        heading: "This part is subject to a recall",
        lead: `${company} has issued a recall that covers this part.`,
        next: v.recall ? undefined : "Please contact support for instructions.",
      };
    case "quarantined":
      return {
        tone: "warning", icon: "pause", live: "assertive", primary: "support",
        heading: "On hold",
        lead: `This part is currently on hold at ${company} and has not been confirmed for sale.`,
        next: "Please contact us before you use or sell it.",
      };
    case "not_released":
      return {
        tone: "warning", icon: "clock", live: "polite", primary: "support",
        heading: "Not yet released",
        lead: `This code is registered, but ${company} has not released this part for sale yet.`,
        next: "If you bought or received this part, please contact us so we can look into it.",
      };
    case "retired":
      return {
        tone: "warning", icon: "archive", live: "polite", primary: "support",
        heading: "Withdrawn from service",
        lead: `${company} has retired this part, so it is no longer confirmed as a current, saleable item.`,
        next: "Please contact us if you have questions about where it came from.",
      };
    case "revoked":
      return {
        tone: "danger", icon: "shield-x", live: "assertive", primary: "support",
        heading: "This code is no longer valid",
        lead: `${company} has withdrawn or replaced this code, so it can't confirm this part.`,
        next: "A replacement label may exist on the part. If this is the only code on it, please contact us.",
      };
    case "invalid":
      return {
        tone: "danger", icon: "search-x", live: "assertive", primary: "support",
        heading: "We can't match this code",
        lead: `This code isn't in ${company}'s records, so we can't confirm the part.`,
        next: "Check for typing mistakes, or scan the QR code again. If the code is on a part you bought, please contact us. We'd like to know about it.",
      };
    case "malformed":
      return {
        tone: "neutral", icon: "scan", live: "polite", primary: "none",
        heading: "No code to check",
        lead: "Scan the QR code on the part with your phone's camera, or type the code printed on its label below.",
      };
    case "rate_limited":
      return {
        tone: "neutral", icon: "timer", live: "polite", primary: "retry",
        heading: "Too many checks for now",
        lead: `To protect the service, we limit how quickly codes can be checked. Please wait${v.retryAfterSeconds ? ` about ${Math.max(1, Math.ceil(v.retryAfterSeconds / 60))} minute${v.retryAfterSeconds > 90 ? "s" : ""}` : " a little"} and try again.`,
      };
    case "unavailable":
      return {
        tone: "neutral", icon: "wifi-off", live: "polite", primary: "retry",
        heading: "Verification is temporarily unavailable",
        lead: "We couldn't reach our verification service, so we can't give you a result right now. This does not mean the part is invalid.",
        next: "Please try again in a few minutes.",
      };
    case "error":
    default:
      return {
        tone: "neutral", icon: "circle-alert", live: "polite", primary: "retry",
        heading: "Something went wrong",
        lead: "We couldn't complete this check, and no result was recorded for you. This does not mean the part is invalid.",
        next: "Please try again. If it keeps happening, contact support and quote the reference below.",
      };
  }
}

/** Client-side failure (offline, DNS, aborted request): never shown as a verification result. */
export const OFFLINE_COPY: StatusCopy = {
  tone: "neutral", icon: "wifi-off", live: "polite", primary: "retry",
  heading: "You appear to be offline",
  lead: "We couldn't reach the verification service from your device, so there is no result yet. This does not mean the part is invalid.",
  next: "Check your connection and try again. Your code is still in this page; you don't need to scan it again.",
};
