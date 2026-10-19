# Privacy

This describes the data the software handles so that **you** (the company operating it) can write an accurate
privacy notice and make your own legal assessment. It is not legal advice. The in-app `/privacy` and `/terms`
pages are generic templates, rendered with your company name and contact details from *Settings*. Have them
reviewed by counsel before launch and replace them (Settings → Company) with your own URLs if you prefer.

## Principles

* **No customer accounts, no customer cookies.** Checking a part needs no sign-up and sets no cookie.
* **No raw IP addresses are stored.** A network is kept only as a keyed hash (HMAC with `NETWORK_HASH_PEPPER`), truncated to 128 bits, usable for "same network?" comparisons and nothing else.
* **Minimum necessary, with defined retention** (below).
* **No third-party trackers, analytics or fonts.** Fonts are self-hosted; there are no external scripts. The CSP would block them.

## What is stored

### From people who check a part (customers, retailers, workshops)

| Data | Where | Purpose | Retention |
|---|---|---|---|
| Result of the check, time, request reference | `verification_events` | Scan history, repeat detection, support | Kept (no personal data) |
| Keyed network hash, 2-letter country | `verification_events` | Detect the same code appearing in several networks/countries | **Scrubbed after 90 days** (configurable); the row stays, the fields are cleared |
| Device class (ios / android / desktop / bot / other) | `verification_events` | Distinguish bots; support | Kept |
| The token | **Never stored.** Only its SHA-256 | Lookup | n/a |

The browser sends the token to the server in the request body; the fragment it travelled in is never sent as
part of a URL, so it is not in access logs.

### From people who contact support

Name (optional), email (optional), phone (optional), serial (optional), subject and message, plus the part-check
reference if they came from a result page. Stored in `support_cases`, visible only to staff who handle cases
(`support.manage`) and auditors. **Resolved or closed cases are anonymised 365 days after receipt** (configurable;
open cases are kept until resolved). The customer is never told whether the serial they typed matched a part.

### From staff

Email, display name, role, status, last sign-in; authentication data held by Supabase Auth (password hash,
MFA factor). Every staff action is recorded in the **append-only** audit log with the actor's email and role.
Audit entries are not deleted by the retention job; decide a retention/archival policy that fits your
obligations and note that append-only is a deliberate property for accountability.

### Operational

* Rate-limit counters keyed by hashes: deleted after one day.
* Application logs: structured and redacted (no tokens, credentials, cookies or DSNs). Retention is set by your hosting provider; configure it.
* Label PDFs: contain live tokens; deleted after 14 days (configurable).

## Cookies and storage

| | |
|---|---|
| Public site and `/verify` | None |
| Staff workspace | Supabase session cookies (httpOnly, SameSite=Lax, Secure in production), strictly necessary |
| Browser storage | None. The app writes nothing to localStorage, sessionStorage or IndexedDB |

## Your obligations (the software cannot do these for you)

* Identify the lawful basis for processing support messages and staff data in your jurisdictions; if EU/UK data subjects are involved, assess GDPR/UK-GDPR roles (you are the controller; Supabase and Vercel are processors) and sign the relevant DPAs.
* Describe retention accurately in your notice, and keep Settings → Retention consistent with it.
* Provide a way to handle access and erasure requests. Erasing a support case means anonymising the row (the retention job does exactly that); the audit log intentionally does not contain customer data.
* Choose regions for Supabase and Vercel that match your data-residency requirements.
* Provide the *Supabase email templates* and sender domain; staff invitations and password resets are emails from your project.

## Language

The interface is English. Sinhala and Tamil message catalogs (`src/i18n/messages.ts`) are structured but
**intentionally empty**, and no language switcher is exposed. They must be translated by a human reviewer, not
machine-generated, before a switcher is added. Customer-facing safety wording (recall text) is entered by your
staff in whatever language you need and is shown exactly as written.
