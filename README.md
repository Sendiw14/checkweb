# Authentic Parts: spare-part authenticity platform

A company serializes the spare parts it makes, prints a unique QR code on each label, and lets anyone check a
part with an ordinary phone camera. The check is answered by the company's own database, in plain language,
without pretending to know more than it does.

> **What a result means.** A *recognized* code means "this code matches a record issued by the company". It is
> evidence, not proof, that the physical part is genuine: a label can be copied onto a fake part. The product
> says so on every result, never accuses anyone, and treats unusual scan patterns as hints for a person to look
> at, not verdicts. See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and its limits.

## How it works

```
Employee registers a product and a batch        (staff workspace, /admin)
  → units get serial numbers (no secret yet)
Employee generates labels
  → the server makes a 256-bit random token per unit, stores only its SHA-256,
    renders a vector PDF of QR labels, and keeps the PDF in private storage
A person prints, applies, and confirms it      (humans confirm; software never assumes)
QC passes, then a (different) person releases the units
Customer scans the QR with the normal camera    →  https://verify.example.com/verify#TOKEN
  → the page removes the fragment, POSTs the token, the server hashes it and answers from the real database
Staff see scans, investigate patterns, revoke / replace labels, quarantine, retire, and run recalls
```

The token lives in the URL **fragment** (`#…`), which browsers never send to servers, so it does not appear in
access logs, CDN logs or `Referer` headers. Plaintext tokens exist only inside the generated label PDFs.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · strict TypeScript · Tailwind CSS 4 · Radix primitives
(shadcn-style, customized) · Motion · React Hook Form + Zod · TanStack Table · Recharts · Sonner ·
PostgreSQL via Supabase (Auth with TOTP MFA, Row Level Security, Storage) · `pg` against SECURITY DEFINER
functions · `pdf-lib` + `qrcode` for labels · Vitest and Playwright (+ axe) for tests · deploys on Vercel.
A modular monolith: one Next.js app, one database.

## Quick start (local, no Docker)

Requirements: Node 22+, pnpm, PostgreSQL 16 (running locally, superuser `postgres`), and for the full local
auth stack a `gotrue` (Supabase Auth) binary. `pdftoppm` (poppler-utils) is needed only by the tests that
decode printed QR codes.

```bash
pnpm install

# 1. Start Postgres + a real Supabase Auth server + the /auth/v1 gateway, apply migrations, write .env.local
GOTRUE_BIN=/path/to/auth pnpm dev:stack          # pnpm dev:stack:reset | dev:stack:down

# 2. Create the first owner (prompts for a password, never echoed; there is no public sign-up)
BOOTSTRAP_OWNER_EMAIL=you@example.com pnpm bootstrap:owner

# 3. Optional: synthetic demo data (local databases only)
pnpm db:seed:dev

# 4. Run the app
pnpm dev                                          # http://localhost:3000   (staff: /login)
```

With Docker you can use `supabase start` instead of step 1; see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### Generate, print and scan a label

1. Sign in, create a **product**, then a **batch** (tick *Register all … units now*).
2. **QR labels → Generate labels**, pick the batch, review the layout preview, tick the acknowledgement.
   The job runs in chunks; you can close the tab and resume. Download the PDF.
3. Print at **100% / Actual size** on your label stock. Scan with an iPhone and an Android phone.
   `pnpm labels:sample` writes a throwaway *test sheet* first (see [docs/LABEL-PRINTING.md](docs/LABEL-PRINTING.md)).
4. Back on the job page: **Confirm printed**, **Confirm applied**. On the batch: **Pass QC**, then (a person
   with the release permission) **Release**.
5. Scan the label: `/verify` now answers *Code recognized*. Before release it honestly says *Not yet released*.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js development server, production build, production server |
| `pnpm lint` · `pnpm typecheck` | ESLint · `tsc --noEmit` |
| `pnpm test` | Unit tests (no database) |
| `pnpm test:db` | Database tests against a real PostgreSQL (`authenticity_test`, created and migrated automatically) |
| `pnpm test:all` | Both of the above |
| `pnpm test:e2e` | Playwright end-to-end + accessibility (needs the local stack and the app; see below) |
| `pnpm db:migrate` | Apply `supabase/migrations/*` using `DATABASE_ADMIN_URL` (tracks applied files) |
| `pnpm bootstrap:owner` | Create the first owner |
| `pnpm db:seed:dev` | Synthetic data; refuses non-local databases |
| `pnpm labels:sample` | Test sheet of SAMPLE labels (codes are not stored and will not verify) |

### Running the end-to-end tests

`pnpm test:e2e` signs in through the real login form as a real Supabase Auth user per role, so it needs the
local stack running (`pnpm dev:stack`). It starts `pnpm dev` itself unless `E2E_BASE_URL` is set. **It writes
test data to whatever database `.env.local` points at**: use a disposable one. Tests share a database and
exercise real rate limits, so they run serially (`workers: 1`).

## Repository map

```
supabase/migrations/   versioned SQL: schema, functions, RLS + grants, indexes  (the source of truth)
src/server/            server-only code: auth, db, repos, labels (spec/pdf/worker), verification, storage
src/app/               routes: (public) site, (auth), admin/*, api/*  · src/proxy.ts = CSP, headers, session refresh
src/components/        ui (primitives), brand, public, admin, auth
src/lib/               shared pure code (schemas, copy, formatters, design tokens)
scripts/               migrate, bootstrap-owner, seed-dev, sample-label, local stack
tests/                 unit · db (real PostgreSQL) · e2e (Playwright + axe)
docs/                  architecture, security, privacy, printing, deployment, recovery, incident response
```

## Documentation

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, data model, the verification transaction, state machines |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, controls, what is and isn't defended |
| [docs/PRIVACY.md](docs/PRIVACY.md) | What is stored, for how long, and why |
| [docs/LABEL-PRINTING.md](docs/LABEL-PRINTING.md) | Specs, printers, stock, test procedure, scanning checklist |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Supabase + Vercel setup, environment, DNS, email, hardening checklist |
| [docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) | Backups, restore drills, what is recoverable |
| [docs/INCIDENT-RESPONSE.md](docs/INCIDENT-RESPONSE.md) | Revoking tokens, replacing labels, recalls, leaked PDFs |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local stack, testing strategy, conventions |
| [docs/DESIGN.md](docs/DESIGN.md) | Design tokens, type scale, contrast rules, motion |
| [docs/FINAL-REPORT.md](docs/FINAL-REPORT.md) | What was built, what was tested, what was not, what you must configure |

## Status and honesty

This repository contains working, tested software, but **it has not been deployed, and several things can only
be verified in your environment** (real phone cameras and printers, Supabase Storage, Vercel, email delivery).
[docs/FINAL-REPORT.md](docs/FINAL-REPORT.md) separates *implemented*, *tested here*, *not verified*, and *you
must configure*, without rounding up.
