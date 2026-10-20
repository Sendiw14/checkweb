# Security

This document states what the system defends against, how, and (equally important) what it does **not**
defend against. Nothing here is a certification; it is an engineering description you can test.

## What is being protected

| Asset | Why it matters |
|---|---|
| The set of valid tokens | If an attacker can *guess* a valid token they can make a fake part pass a scan |
| Label PDFs | They contain live tokens for every unit in a batch |
| The integrity of unit state | Releasing, recalling or revoking must be done only by authorized people |
| The audit trail and scan history | Evidence for investigations and recalls |
| Staff accounts | The route to everything above |
| Customer and staff personal data | Minimized, see [PRIVACY.md](PRIVACY.md) |

## What a QR check can and cannot prove

A recognized code proves that *someone holding a label* presented a token the company issued. It does **not**
prove the part is genuine: a genuine label can be photographed and copied onto a counterfeit part (a *clone*).
The system raises the cost and makes cloning **detectable**, not impossible:

* Each token is unique; a cloned label is a second presenter of the same token. Repeat scans from several
  networks or countries, or in a short time, raise a `suspicious` result and open an investigation (a hint for a
  person to examine, never a verdict).
* Staff can revoke a token and issue a replacement; the old label then says *This code is no longer valid*.
* Customers are told plainly that a recognized code is a strong sign, not a guarantee, and to contact the
  company when something looks wrong.

If your risk is organized cloning of high-value parts, add physical measures (tamper-evident or
destructible labels, holograms, scratch-off codes) on top. This software supports them but cannot supply them.

## Controls

### Token design
* 32 bytes from the OS CSPRNG (256 bits), base64url. Backup code: 20 Crockford-base32 characters (100 bits). Neither is derived from serials, ids, timestamps or counters.
* Only `SHA-256(token)` and a domain-separated hash of the backup code are stored. `app_server` (the admin application) cannot even `SELECT` the hash columns. Tests assert no plaintext token appears in any table, audit entry or log.
* The token is in the URL fragment, which is not sent to servers; the page removes it from the address bar immediately and keeps it only in memory. `/verify` is `no-store` with `Referrer-Policy: no-referrer`.
* Guessing is infeasible (2²⁵⁶) and additionally throttled: a network that submits 20 unknown credentials in 10 minutes is refused (HTTP 429) even for valid ones until the window passes.

### Authentication and sessions
* Supabase Auth, PKCE, httpOnly + SameSite=Lax (+ Secure in production) cookies; no tokens in browser storage; no browser-side Supabase client.
* Public sign-up must stay disabled. The first owner is created with `pnpm bootstrap:owner`; everyone else is invited by an owner/admin and sets a password through a single-use link confirmed by a **POST** (so link scanners that pre-fetch URLs cannot burn it).
* TOTP MFA is available to everyone. An enrolled factor is always enforced; `REQUIRE_MFA_FOR_PRIVILEGED=true` additionally requires owners and admins to enrol. A password-only session of an enrolled user is refused everywhere (pages, actions, APIs). This was a real gap that testing found and fixed; there is a regression test.
* Login, password reset, MFA, password change, search, exports and downloads are rate limited (per account and/or per client network, as appropriate). Login failures are indistinguishable (unknown email, wrong password, no membership and suspended all give the same message).
* Everyday sign-out ends only the current session; "sign out other devices" and password changes revoke the others.
* Suspending or demoting someone takes effect on their next request: membership and role are re-read on every request, regardless of how long their JWT would remain valid.

### Authorization
* One permission table; every admin page, Server Action and API route checks it on the server. Hiding a button is never the control.
* Anti-escalation: admins cannot grant or modify owner/admin roles, nobody can change their own role or suspend themselves, and the last active owner cannot be removed (database trigger).
* The role × action matrix, route tests and a static check that every exported Server Action is guarded all run in CI; each was mutation-checked against a weakened and a removed guard.
* Row Level Security is on for every table; the browser-facing roles (`anon`, `authenticated`) have no write grants at all.

### Transport, headers and browser hardening (`src/proxy.ts`)
* A per-request CSP **nonce** with `strict-dynamic`; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`; `unsafe-eval` only in development. The e2e suite verifies the browser actually blocks foreign images, frames and fetches.
* `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera, microphone, geolocation disabled), COOP/CORP, and HSTS in production.
* Staff pages are `no-store`.
* **Important:** with a `src/` directory Next.js only loads `src/proxy.ts`. A proxy file at the repository root is silently ignored, which would disable all of the above. A unit test guards the location.

### Data, files and logs
* Label PDFs: private bucket, expire (default 14 days) and are purged, downloads require `labels.download`, are rate-limited, audited by hash, and served by a 60-second signed URL (Supabase) or streamed.
* The logger redacts credential-shaped fields and strings (tokens, JWTs, bearer headers, DSNs, URL fragments); ESLint forbids `console.*` in application code.
* `audit_logs` and `verification_events` are append-only at the database level; audit metadata that looks like a credential is rejected by a trigger.
* CSV exports are formula-injection safe, rate limited, audited, and never contain token material, raw network identifiers or customer contact details.
* Uploaded images are type-sniffed by magic bytes (not by extension or declared MIME type), size limited, and re-served only from allow-listed paths.

### Database roles
| Role | May | May not |
|---|---|---|
| `app_verifier` | execute `verify_part_token`, `rate_limit_hit` | touch any table |
| `app_server` | read and write what the admin app needs, call the SECURITY DEFINER functions | read token hashes; write units, tokens, events or audit rows directly |
| `anon` / `authenticated` | staff: read-only, role-scoped `SELECT` (network identifiers excluded by column grants) | write anything; read tokens, label artifacts or rate counters |
| `service_role` | Used only server-side for user administration and private storage | Never exposed to the browser |

## Known limits and residual risks

| Risk | Status |
|---|---|
| Clone of a genuine label onto a fake part | **Detectable, not preventable** (see above) |
| Screenshot or leak of a label PDF | Mitigated by private storage, expiry, audited downloads and least-privilege roles; a leaked PDF means those tokens must be revoked ([INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md)) |
| A malicious insider with `labels.download` | Can obtain live tokens for a batch. Downloads are audited and attributable; keep that permission narrow |
| Compromised owner account | Owners can do everything. Require MFA, keep few owners, review the audit log |
| Database or Supabase project compromise | Hashes make stolen tokens unusable for *new* codes but valid-code checks still depend on the database being trustworthy |
| Denial of service | Application rate limits are a floor. Put a WAF / platform firewall in front, and size the database |
| IP address handling | Rate limiting trusts `x-real-ip` / `x-forwarded-for` as set by the platform. Behind anything other than Vercel, make sure clients cannot spoof them |
| Dependencies | `pnpm audit --prod` (runtime) reported **no** known vulnerabilities on 2026-10-19. The full audit reports **1 high advisory in a dev-only transitive dependency**: `braces` ≤ 3.0.3 (stack exhaustion on deeply nested glob patterns, GHSA-vfj7-8cjw-p6xm) via `eslint-config-next → fast-glob → micromatch`; the advisory lists no patched version. It is in lint tooling only, not in the runtime or the build output, and is accepted for now. Run `pnpm audit` in CI and enable Dependabot |
| Not independently pen-tested | No third-party penetration test has been performed |

## Reporting a vulnerability

Publish a contact (e.g. `security@your-domain`) and a `security.txt`. Treat a suspected token leak as an
incident: follow [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md).
