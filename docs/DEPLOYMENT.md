# Deployment (Supabase + Vercel)

> **This has not been deployed by the author.** The steps are written from the code and from the documented
> behavior of Supabase and Vercel, and the application has been run against a real PostgreSQL and a real
> Supabase Auth server locally. Items marked **verify** depend on your project's settings or plan and could not
> be confirmed from here. Do a full rehearsal in a staging project first.

## 0. Decide first (these are hard to change later)

| Decision | Why it matters |
|---|---|
| **The verification domain** (e.g. `verify.example.com`) | Every printed QR encodes it, **for the life of the part**. Use a domain and DNS you will control for decades; never rely on a vendor subdomain (`*.vercel.app`). Changing it later means redirecting forever or reprinting labels |
| Supabase **region** | Data residency and latency |
| Who are the owners | At least two (the system refuses to remove the last one), with MFA |
| Label stock and printers | See [LABEL-PRINTING.md](LABEL-PRINTING.md) |

## 1. Supabase project

1. Create the project (choose region and a strong database password; store it in a password manager).
2. **Authentication → Providers → Email**:
   * **Disable "Allow new users to sign up".** Staff are invited by an owner/admin; there is no public registration.
   * Minimum password length **12** (the app enforces 12 too).
   * Keep email confirmation on.
3. **Authentication → Multi-Factor**: leave **TOTP** enabled. (**verify** it is enabled for your plan.)
4. **Authentication → URL configuration**: Site URL = your `PUBLIC_SITE_URL`; add `https://verify.example.com/auth/confirm` to the redirect allow-list.
5. **Email**: configure **custom SMTP** with your own sender domain (SPF/DKIM/DMARC). Supabase's default sender is rate limited and not for production. Only *forgotten-password* emails are sent by Supabase; **staff invitations are links shown to the inviter to share securely** (no email is sent for them).
6. **Email templates → Reset password** must link to the app's confirm page, which exchanges the token on a button press (so mail scanners can't consume it):

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
   ```
7. **Storage**: migrations create the buckets `product-images` (public, ≤5 MB, JPEG/PNG/WebP) and `label-artifacts` (**private**, PDF only). Confirm both exist and that `label-artifacts` is not public.

## 2. Database

Connection strings come from *Project settings → Database*. Use the **direct** connection (or session mode)
for migrations and the **pooler** for the running app (**verify** which fits your plan and connection limits).

```bash
# Migrations and one-off scripts use an admin role. NEVER put DATABASE_ADMIN_URL in the app's runtime environment.
export DATABASE_ADMIN_URL='postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres'
pnpm db:migrate
```

Then give the two application roles passwords (run once, as `postgres`, e.g. in the SQL editor):

```sql
alter role app_server   login password '<long random>';
alter role app_verifier login password '<different long random>';
```

* `app_verifier` can execute exactly two functions (`verify_part_token`, `rate_limit_hit`) and touches no table. It serves the public check.
* `app_server` serves the staff workspace with least privilege (cannot read token hashes; cannot write units/tokens/events/audit directly).
* Both have a role-level `statement_timeout`.

Build the runtime URLs with those roles (through the pooler the username may need the project suffix, e.g.
`app_server.<project-ref>`; **verify**). Production defaults to **verified TLS**: set `DATABASE_SSL_CA` to the Supabase CA certificate (PEM). `DATABASE_SSL=no-verify` is **refused** in production.

## 3. Vercel project

Import the repository; framework preset **Next.js**; Node 22. Set these **Production** (and Preview, with a *separate* staging Supabase project) environment variables. There are deliberately **no** `NEXT_PUBLIC_*` variables.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `app_server` connection string |
| `VERIFIER_DATABASE_URL` | recommended | `app_verifier` connection string (falls back to `DATABASE_URL`, which defeats the isolation) |
| `DATABASE_SSL` / `DATABASE_SSL_CA` | prod | `verify` (default for non-local hosts) + the CA PEM |
| `DATABASE_POOL_MAX` | no | Default 5 per instance. Keep `instances × pool ≤` your connection limit |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret.** Server-only: user administration and private storage. Mark as sensitive |
| `PUBLIC_SITE_URL` | yes | `https://verify.example.com`. Must be `https` in production. Used inside QR codes |
| `NETWORK_HASH_PEPPER` | yes | ≥32 random characters. Keys the network hash. Rotating it breaks "same network" comparisons across the rotation (no other harm) |
| `ARTIFACT_STORAGE` | yes | `supabase`. `local` is refused in production |
| `CRON_SECRET` | yes | ≥24 random characters. The maintenance route refuses everything without it |
| `REQUIRE_MFA_FOR_PRIVILEGED` | recommended | `true`: owners and admins must enrol an authenticator before using the workspace |

Generate secrets with `openssl rand -base64 48`. The app validates configuration on first use and **fails
closed**: a production deploy with a missing or unsafe value logs *which setting is wrong (never its value)*,
and `/api/health` answers `503 degraded`.

### Scheduled maintenance

`vercel.json` schedules `GET /api/cron/maintenance` every 10 minutes. It (1) finishes label jobs whose
browser was closed mid-run, (2) deletes expired label PDFs, (3) applies retention (scrubs old network
identifiers, anonymises old resolved support cases, clears rate-limit counters). Vercel sends
`Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. **verify:** sub-daily cron
schedules and a 60-second function duration require a plan that allows them; if not, lengthen the schedule
(retention still runs) and accept slower cleanup of abandoned jobs.

### Domain and headers

Attach `verify.example.com`. Responses already carry a nonce-based CSP, HSTS (production), `X-Frame-Options`,
`Referrer-Policy` and a `Permissions-Policy` that disables the camera for *the site* (customers use the phone's
own Camera app to scan, which is unaffected). `/verify` is `no-store` with `Referrer-Policy: no-referrer`.

## 4. First owner

On a trusted machine with the production variables (including `DATABASE_ADMIN_URL`) exported:

```bash
BOOTSTRAP_OWNER_EMAIL=owner@your-company.com pnpm bootstrap:owner   # prompts for a password, hidden
```

It refuses to run if an active owner already exists. Sign in at `/login`, **set up the authenticator**
(Account security), then invite the rest of the team under *Team*. Share invitation links over a secure channel.

## 5. Configure the product

*Settings*: company name and legal name, support email/phone, privacy/terms links (or use the built-in
templates after legal review), logo, label defaults, repeat-check thresholds, retention periods. Add products,
then batches. Print a **test sheet** before any real run ([LABEL-PRINTING.md](LABEL-PRINTING.md)).

## 6. Pre-launch checklist

- [ ] Staging rehearsal done end to end: product → batch → labels → **physical print** → scan on iPhone and Android → release
- [ ] Sign-ups disabled; password minimum 12; MFA enabled; `REQUIRE_MFA_FOR_PRIVILEGED=true`
- [ ] At least two owners, both with MFA
- [ ] `label-artifacts` bucket is private; `DATABASE_ADMIN_URL` is **not** set in Vercel
- [ ] Custom SMTP works; password-reset email received and its link opens `/auth/confirm`
- [ ] `/api/health` is healthy; the cron route returns 401 without the secret and 200 with it
- [ ] Verified TLS to the database (no `no-verify`)
- [ ] Backups/PITR enabled and a **restore drill** performed ([BACKUP-RECOVERY.md](BACKUP-RECOVERY.md))
- [ ] Privacy notice and terms reviewed by counsel; retention periods set to match them
- [ ] A WAF/firewall or Vercel Firewall rules in front, rate limits sized for expected traffic
- [ ] Log retention and alerting configured (error rate, 5xx on `/api/verify`, 429 spikes, cron failures)
- [ ] Incident runbook read by the people on call ([INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md))
- [ ] Sinhala/Tamil only if translated by a human reviewer (not shipped enabled)

## 7. Operating notes

* **Capacity**: each check is one transaction (a row lock on one unit). Per-unit contention is limited to
  repeat scans of the *same* unit. Rate limits (default 60 checks/minute per network, 1,200/minute global) are a
  floor; tune them in `src/server/ratelimit.ts` for your traffic and add edge protection.
* **Schema changes**: add a new migration file; never edit an applied one. Apply with `pnpm db:migrate` before
  deploying code that needs it.
* **Rollbacks**: keep migrations additive (add columns/tables/functions, don't drop or rename in the same release) so that rolling the code back remains possible.
