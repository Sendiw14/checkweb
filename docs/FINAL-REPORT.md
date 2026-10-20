# Final implementation report

Date: 2026-10-19. Branch: `claude/automotive-authenticity-platform-gxvwmt`.

This report says what exists, what was proven, what was **not** proven, and what you must do. Where something
could not be verified here it says so. Numbers are from runs in this environment, not estimates.

## 1. Summary

A working spare-part authenticity platform: staff register products and batches, generate serialized QR labels
(vector PDFs, secrets stored only as hashes), confirm printing and application, pass QC and release; customers
scan with a normal phone camera and get an honest, plainly worded answer from the real database; staff then
watch scan activity, investigate unusual patterns, revoke and replace labels, quarantine, retire and recall.
It runs on Next.js 16 and PostgreSQL (Supabase), with role-based access, MFA, row level security, an
append-only audit log and a privacy-minimizing design.

**It has not been deployed.** Everything below was run locally against a real PostgreSQL 16 and a real
Supabase Auth (GoTrue) server, in Chromium.

## 2. Implemented

| Area | What exists |
|---|---|
| **Public site** | Home, `/verify` (QR fragment + manual code), `/support` form, FAQ, privacy, terms, branded 404, all responsive and accessible |
| **Verification** | `POST /api/verify` over one SECURITY DEFINER function: outcomes *recognized (first/repeat)*, *suspicious*, *recalled*, *quarantined*, *not released*, *retired*, *revoked*, *invalid*, plus *malformed*, *rate limited*, *unavailable*, *network failure*; explainable risk rules; auto-investigations; honest failure when the database is down |
| **Labels** | Spec validation (quiet zone, module size), vector PDF, chunked and resumable jobs, private storage with expiry, audited signed downloads, replace/revoke, test sheet script |
| **Staff workspace** | Dashboard, products, batches (production pipeline), part units, QR labels and jobs, scan activity, investigations, recalls (scope, approval, close), support cases, reports with CSV export, team, audit log, settings, account security |
| **Security** | Supabase Auth with TOTP MFA, six roles and a permission table, server-side checks on every page/action/route, RLS and least-privilege roles, nonce CSP and security headers, rate limits, redacting logger, formula-safe CSV, image sniffing, append-only audit |
| **Operations** | Versioned migrations, cron maintenance (resume jobs, purge files, retention), bootstrap-owner, seed, local stack without Docker, sample-label script, CI workflow |
| **Docs** | README plus architecture, security, privacy, label printing, deployment, backup/recovery, incident response, development, design |

## 3. Tested (what was actually run)

| Layer | Result | What it covers |
|---|---|---|
| Static | `tsc --noEmit` clean; ESLint 0 errors (3 informational React-Compiler warnings about react-hook-form's `watch`) | Strict TypeScript; `no-console`; unused code |
| Unit | **144 tests, 15 files**, all passing | Token and hash generation, response shaping, response normalizer, redacting logger, env validation, client info, contrast of 26 token pairs, permissions, safe redirects, CSV safety, image sniffing, label geometry, proxy placement |
| Database | **858 tests, 12 files**, all passing, on a real PostgreSQL | Constraints and state machines; `verify_part_token` for every outcome; concurrency (parallel scans, revocations, workers); RLS, grants and function exposure; label worker incl. simulated storage outage; **QR codes decoded from generated PDFs resolve to the right unit**; verify API; every Server Action × every role (688 checks, mutation-checked); CSV/download/search/cron routes per role; role timeouts; wizard batch query |
| End to end | **460 passed, 0 failed, 1 skipped** (461 tests, one clean run, 20 min). The skip is the mobile-menu test, which only applies to the phone project | See below |
| Production build | `next build` succeeds; served with `next start` and production-valid settings: strict CSP (no `unsafe-eval`), HSTS, cron 401/200, health ok; **303 passing, 0 failing** (headers, verify, public, auth, MFA, a11y, responsive, RBAC) against it | The same specs, against the production server |
| Restore drill | Run once locally: dump → restore → counts match → a real label verifies through the least-privilege role → triggers still enforce | [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md) |
| Bulk revoke | Dry-run: 1,200 units revoked, 1,200 events written, rolled back | [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) |
| Dependencies | `pnpm audit --prod`: none. Full audit: 1 high advisory in a **dev-only** transitive dependency (`braces`, no patched version) | [SECURITY.md](SECURITY.md) |

End-to-end suites (Playwright, Chromium desktop 1280 and a Pixel 7 phone viewport, real Supabase Auth and
database, one real user per role):

| Spec | Proves |
|---|---|
| `security-headers` | CSP with per-request nonce on every script; browser really blocks foreign images/frames/fetches; staff pages `no-store`; verify page `no-referrer` |
| `verify` | Every customer outcome from the real DB; fragment never in a URL, storage or request line; repeat counting; backup code; outage/offline/rate-limit states never read as verdicts; approved recall text shown verbatim; no accusatory wording |
| `auth` | Generic failures (no account enumeration), open-redirect refusals, httpOnly cookies, sign-out and back button, limiter, reset flow, password change revoking other sessions |
| `mfa` | Enrolment with a real TOTP, enforcement, **regression test for the password-only bypass**, limiter on code guessing |
| `rbac` | 170 checks against an **independent** oracle: navigation, every page and detail page, write controls, CSV exports and search per role; anonymous refusals |
| `workflow` | Product → batch → labels → PDF download → **QR decoded from the PDF** → printed/applied → QC → release (different role) → customer scan; audit trail names each actor and holds no secrets |
| `team` | Invite → one-time link (scanner-safe) → choose password → role-scoped sign-in; role change and suspension take effect on the next request; admins cannot grant top roles |
| `investigation` | Open from a part, one case per unit, notes, resolve; who may and may not |
| `public` | Home, FAQ keyboard use, skip link, titles, robots, 404; support form validation, consent, silent serial linking, XSS-as-text, honeypot, rate limit |
| `a11y` | axe WCAG 2.0/2.1/2.2 A+AA on every public page, every verification outcome and every staff page with real data, plus open dialogs and menus |
| `responsive` | No sideways scroll and no console/CSP errors at 320, 360, 390, 768, 1024, 1440 px for every route |

## 4. Defects found by testing (and fixed)

These are real, and several would have shipped without the tests. Each has a regression test.

1. **The request proxy never ran.** `proxy.ts` sat at the repository root; with a `src/` directory Next.js only loads `src/proxy.ts`. The CSP, security headers, session refresh and anonymous redirect were silently inactive while every page still rendered. Found by the first e2e spec (a lost redirect destination). Fixed; unit guard added.
2. **MFA could be skipped.** With `REQUIRE_MFA_FOR_PRIVILEGED=false`, a user who had *enrolled* an authenticator could reach staff pages with a password-only session by typing a URL. An enrolled factor is now always enforced.
3. **The verify page could blank** if a proxy or outage returned JSON without a request reference. Responses now go through a pure, tested normalizer; unknown statuses degrade to an honest error state.
4. **The manual-code label was not tied to its input** (screen readers would announce an unlabeled field).
5. **Sign-out signed people out of every device.** Everyday sign-out is now local; "sign out other devices" is explicit.
6. **No 404 pages existed.** Branded public and staff versions added.
7. **Sideways scrolling** from `sr-only` spans escaping table scrollers and from grids with an implicit auto track (a base rule now prevents the class).
8. **Accessibility:** label-in-name mismatches, an empty-label SVG, an opacity-reduced label at 4.07:1, an unlabeled hidden file input, a scroll region keyboard users could not focus, modal menus that `aria-hid` focusable content, and **focus was lost after closing any dialog or sheet** (Radix only restores focus to a `Trigger`; ours open from ordinary buttons). The last one was found by the final full run, fixed once in the shared UI layer, and now has tests for a button, a menu item and a sheet.
9. **The label wizard hid older batches** needing labels behind 200 finished ones (filter ran after `LIMIT`).
10. **Statement timeout was a client startup parameter**, which transaction poolers commonly reject; now a role setting.
11. **A DB test depended on leftover owner rows** (intermittent as files reorder); isolated.
12. Smaller: `npm run labels:sample` referenced a script that did not exist; a failed-MFA audit entry lacked its actor; the settings loader hid *why* production config was rejected; a dead parameter in the email-confirm flow; the part page had no way to open an investigation.

## 5. Not verified (be sceptical of anything here)

| Not done | Why it matters |
|---|---|
| **Real phone-camera scanning and real printing** | QR readability on iOS and Android cameras, on your stock, after abrasion, is the core physical claim. PDFs were only verified by rasterising and decoding them in software |
| **Browsers other than Chromium** (Firefox, Safari/WebKit, real iOS and Android devices) | The "phone" tests are Chromium emulating a phone |
| **Supabase Storage** adapter against a live project; hosted Supabase Auth; SMTP delivery; email templates | Local runs used a filesystem store and a self-hosted GoTrue; password-reset email delivery is untested |
| **Deployment**: Vercel build, environment, cron schedule and duration limits, custom domain, TLS to a hosted database, pooler behavior | Steps are written from documentation, flagged *verify* |
| **Performance and load**: no load test, no Core Web Vitals measurements, no profiling at production data volumes (tests used thousands of units, not millions) | Default rate limits are 60/min per network and 1,200/min global |
| **Manual assistive-technology review** (screen reader, voice control, high-contrast, zoom) | axe finds a subset of issues; it is not a conformance audit |
| **Independent security review or penetration test** | None performed |
| **CI**: `.github/workflows/ci.yml` has never been run | Treat the first run as part of your verification |
| **Supabase PITR and restore of a hosted project** | Only a local restore was drilled |
| **Sinhala and Tamil** | Catalogs are structured but empty; machine translation was deliberately not used |
| **Staff camera QC scanning** | Not implemented (the site's Permissions-Policy disables the camera). Staff QC check by pasting a URL or typing the backup code, or use the phone's camera app |
| **Native roll-printer formats** (ZPL/EPL) | Not implemented; print the PDF through the driver |

## 6. What your company must configure

Full steps in [DEPLOYMENT.md](DEPLOYMENT.md).

* A permanent **verification domain** (it is encoded in every printed QR) and DNS.
* A **Supabase project** (region, strong DB password), with sign-ups **disabled**, minimum password 12, TOTP on, the Site URL and redirect allow-list, **custom SMTP** with SPF/DKIM/DMARC, and the password-reset template pointing at `/auth/confirm`.
* Run migrations; set passwords for the `app_server` and `app_verifier` roles; build runtime URLs; supply the CA certificate for verified TLS.
* **Vercel**: all environment variables (see `.env.example`), `CRON_SECRET`, a plan that supports the cron schedule and function duration, never set `DATABASE_ADMIN_URL`.
* Create the **first owner** and a second owner; both enrol an authenticator; set `REQUIRE_MFA_FOR_PRIVILEGED=true`.
* **Backups/PITR**, an independent encrypted dump, and a **restore drill** before launch; monitoring and alerting on `/api/verify` 5xx/429, cron failures, and error rates; log retention.
* A WAF or firewall in front; capacity sizing for your traffic.
* **Label hardware**: choose stock and printer for the part's environment and run the scanning test on iPhone and Android ([LABEL-PRINTING.md](LABEL-PRINTING.md)).
* **Legal and privacy**: counsel review of `/privacy` and `/terms`, lawful basis, DPAs with Supabase/Vercel, retention periods matched to your notice, an erasure/access process.
* Company identity in *Settings* (name, legal name, support contacts, logo), approved **recall wording** process, and an incident runbook owner ([INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md)).
* Human translation if you want Sinhala or Tamil; a manual accessibility review before launch.

## 7. Deviations from the brief (deliberate)

* **`input-border` `#8A94A6`** is added to the palette: the specified `#E4E7EC` is 1.3:1 on white and fails WCAG 1.4.11 for control boundaries. Decorative dividers keep `#E4E7EC`.
* **No customer-facing UI language switcher**, and no machine translation (see above).
* **No Docker**: the local stack uses a local PostgreSQL and a GoTrue binary; Docker/`supabase start` is documented as the alternative.
* **Next.js 16** conventions apply (`proxy.ts` replaces middleware; async `params`).
* **`/api/verify` returns 404 for an unknown code.** The browser logs it as a failed fetch; the page handles it.
* An unknown code and a revoked code are *different* answers on purpose ("can't match" vs "no longer valid").

## 8. Screenshots

Reproducible with `pnpm docs:screenshots` (real output of the running app; customer outcomes come from the real
verification function, the unavailable state simulates the 503 the server would send). See
[`docs/screenshots/`](screenshots/).

## 9. Recommended next steps

1. Print a test sheet on real stock and scan it on real phones. Everything else depends on this.
2. Stand up a staging Supabase + Vercel and walk the checklist in DEPLOYMENT.md; run the e2e suite against it.
3. Run the CI workflow; add `pnpm audit` and Dependabot.
4. Commission a penetration test and a manual accessibility review before public launch.
5. Decide your cloning-risk posture ([SECURITY.md](SECURITY.md)): tamper-evident labels for high-value parts.
