# Development

## Local stack

Everything runs locally. Two options.

### A. Without Docker (what the author used)

You need PostgreSQL 16 (superuser `postgres`/`postgres` on `127.0.0.1:5432`, or override with
`DEV_PG_ADMIN_URL`) and a Supabase Auth (**GoTrue**) binary. Build one from <https://github.com/supabase/auth>
(`make build`, produces `auth`) or use a prebuilt release, then:

```bash
GOTRUE_BIN=/path/to/auth pnpm dev:stack        # up: DB + migrations + GoTrue + /auth/v1 gateway on :54321, writes .env.local
pnpm dev:stack:reset                           # drop and recreate the dev database
pnpm dev:stack:down
```

The stack creates the database `authenticity_dev` with the Supabase role/schema layout (`anon`,
`authenticated`, `service_role`, `auth`, `storage`) and applies `supabase/migrations`. It writes `.env.local`
with generated keys and the local role passwords, and state under `.local/` (git-ignored).

### B. With Docker

`supabase start` (Supabase CLI) gives you the real stack. Put its URL and keys in `.env.local`, run
`DATABASE_ADMIN_URL=… pnpm db:migrate`, then set passwords for `app_server` and `app_verifier`
(see [DEPLOYMENT.md](DEPLOYMENT.md) §2).

### Then

```bash
BOOTSTRAP_OWNER_EMAIL=you@example.com pnpm bootstrap:owner   # first owner
pnpm db:seed:dev                                              # optional synthetic data; local DBs only
pnpm dev
```

## Tests

| Layer | Command | What it proves | Needs |
|---|---|---|---|
| Unit | `pnpm test` | Token generation/hashing, public result shaping, response normalizer, redacting logger, env validation, client-info, contrast of every token pair, permissions, safe redirects, CSV safety, image sniffing, label geometry, proxy placement | Nothing |
| Database | `pnpm test:db` | Real PostgreSQL: constraints, triggers and state machines, `verify_part_token` for every outcome, concurrency (parallel scans, revocations, workers), RLS/grants/function exposure, label worker with a failing store, **printed QR codes decoded from the PDF resolve to the right unit**, the verify API route, every server action × role, route authorization | PostgreSQL superuser (`TEST_PG_*` env to override); creates and migrates `authenticity_test` itself; `pdftoppm` for the PDF-decoding tests |
| End to end | `pnpm test:e2e` | Real browser, real Supabase Auth, real database: headers/CSP, every customer outcome, auth/MFA/RBAC, the full production workflow (UI → PDF → QR decode → release → customer scan), support form, axe accessibility, responsive overflow at six widths | The local stack running; writes to the DB in `.env.local` (disposable!) |

Conventions the tests protect (and why):

* **Every export of a `"use server"` file is a public endpoint.** Wrap the body in `authorized(permission, …)` (or `signedIn` for self-service) and add the function to the registry in `tests/db/action-authorization.test.ts`; the static test fails otherwise.
* **No `console.*`** in application code (ESLint): log through `@/server/logger`, which redacts credentials.
* **Plaintext tokens never leave the label job.** Don't add columns, logs, audit metadata or error messages that could carry one.
* **`proxy.ts` must live in `src/`.** Next.js ignores a root-level proxy file when `src/` exists; a unit test guards it.
* **Inside `<Field>`, never set `id` on the control.** Pass `id` to `Field` (otherwise the label points at nothing).
* **Grids:** a bare `.grid` is a single shrinkable column by default; prefer explicit `grid-cols-*` for multiple columns.
* **Dialogs and menus:** menus are non-modal (`modal={false}`); confirmations use `ConfirmDialog` (role `alertdialog`).
* **Customer wording lives in `src/lib/verification-copy.ts`.** Don't write verdict text elsewhere; keep it free of accusations.
* **Migrations are append-only.** Never edit an applied migration; add a new numbered file.

## Useful scripts

```bash
pnpm labels:sample --count 24         # test sheet of SAMPLE labels (not stored, won't verify)
pnpm typecheck && pnpm lint           # both must be clean
node scripts/shots.mjs …              # screenshots helper used during visual QA
```

## Troubleshooting

* **`/admin` redirects to login with `next=/admin/dashboard` for every URL**, or pages have no CSP header: the proxy isn't running. Check it is `src/proxy.ts`.
* **E2E: "Too many attempts"**: the limiter is real. The suite resets counters in setup; if you drive the UI by hand a lot, `delete from public.rate_limit_counters`.
* **`next build` logs `settings.load_failed`** with `config: [...]`: production validation rejected your environment (for example `PUBLIC_SITE_URL` not `https`, `ARTIFACT_STORAGE=local`, missing `CRON_SECRET`). It names the setting, never the value.
* **Don't run `next build` while `next dev` is serving from the same `.next`**: restart the dev server afterwards.
* **PDF-decoding tests skipped or failing**: install poppler-utils (`pdftoppm`).
