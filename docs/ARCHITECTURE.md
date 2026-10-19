# Architecture

A modular monolith: one Next.js application and one PostgreSQL database (Supabase). No queues, no extra services.
Long-running work (label PDF generation) is chunked and resumable so it fits serverless time limits.

```
                 ┌────────────────────────── Vercel ──────────────────────────┐
 phone camera →  │  /verify  (static shell + client script)                    │
                 │     └─ POST /api/verify ──► verification service ───────────┼──► app_verifier role
                 │                                                             │      └─ verify_part_token()
 staff browser → │  /admin/*  (Server Components, Server Actions)              │
                 │     └─ session + role checked on every request ─────────────┼──► app_server role (least privilege)
                 │  /api/admin/*  CSV export · label PDF download · search     │      └─ SECURITY DEFINER functions
                 │  /api/cron/maintenance  (Vercel Cron, bearer secret)        │
                 │  src/proxy.ts  CSP nonce · headers · session refresh        │
                 └──────────────┬──────────────────────────────────────────────┘
                                │ Supabase Auth (JWT + TOTP MFA) · Storage (private label PDFs)
                         PostgreSQL: tables + RLS + grants + functions + triggers
```

## Layers

| Layer | Where | Rule |
|---|---|---|
| Routes and UI | `src/app`, `src/components` | No business rules. Server Components render; Server Actions call guards, then repos. |
| Authorization | `src/server/auth` | One permission table (`permissions.ts`). `authorized(permission, fn)` wraps every admin Server Action; `assertPermission` guards route handlers; `requirePermission` guards pages. Membership and role are re-read from the database on every request. |
| Domain and data | `src/server/repos`, `src/server/labels`, `src/server/verification` | Plain SQL through `pg`. Sensitive writes go through SECURITY DEFINER functions, never direct `INSERT`. |
| Database | `supabase/migrations` | The source of truth: constraints, state machines (triggers), RLS, grants, functions. Application code is not trusted to keep invariants. |

Every export of a `"use server"` file is a public HTTP endpoint. `tests/db/action-authorization.test.ts` parses
each actions file and fails if a function is exported without a guard or without a reviewed registry entry.

## Data model

| Table | Purpose |
|---|---|
| `app_settings` | Singleton: company identity, label defaults, risk thresholds, retention periods |
| `admin_memberships` | Staff: role and status, keyed by the Supabase Auth user id. No row, no access |
| `products` | SKU, part number, name, brand, category, optional photo |
| `manufacturing_batches` | Batch of a product: expected quantity, processing status, release status |
| `part_units` | One physical unit: serial number, lifecycle, label progress, scan counters |
| `part_tokens` | The credential per unit: `token_hash` (SHA-256 of the 256-bit token), `code_hash` (backup code). **No plaintext, ever.** One *active* token per unit (partial unique index) |
| `label_jobs`, `label_job_units`, `label_job_artifacts`, `label_events` | Label generation: chunked jobs, which units, PDF files (path + hash + expiry), and an event trail |
| `verification_events` | Append-only record of every check: result, channel, keyed network hash, country, device class, risk score and reasons |
| `recalls`, `recall_products`, `recall_batches`, `recall_units` | Recalls with relational scope (no polymorphic references) |
| `investigations`, `investigation_notes` | Cases from risk rules or people; one open case per unit |
| `support_cases` | Messages from the public form |
| `audit_logs` | Append-only record of staff actions |
| `rate_limit_counters` | Fixed-window counters shared by all serverless instances |

Three separate dimensions describe a unit, deliberately not merged:

* **Lifecycle** (`part_units.lifecycle_status`): `registered → qc_passed → released`, plus `quarantined` (reversible) and `retired`.
* **Label** (`label_status`): `unlabelled → issued → printed → applied`. `applied` is only ever set by a person.
* **Credential** (`part_tokens.status`): `active`, `revoked`, `replaced`.

Triggers enforce the transitions: a unit cannot be released without an applied label and an active token; a
credential cannot be reactivated; the last active owner cannot be removed or demoted; `audit_logs` and
`verification_events` cannot be updated or deleted by anyone, including a superuser session; audit metadata that
looks like a credential is rejected.

## The verification transaction

`public.verify_part_token(hash, kind, channel, request_id, network_hash, country, ua_class)` runs in one
transaction as the only function the public path may execute (the `app_verifier` role has no table access).

1. Validate arguments. Look the hash up in `part_tokens` (`token_hash` or `code_hash`).
2. Unknown → record an `invalid` event, return `invalid`.
3. Lock the unit row (`FOR UPDATE`), re-read the token (so a revocation that committed while waiting is honoured).
4. Decide the result, in this precedence:
   `revoked` › `recalled` (an active recall covering the unit, its batch or its product) › `quarantined` (unit or batch) › `retired` › `not_released` › `recognized_first` (no previous customer scan) › `recognized_repeat`.
5. Customer scans only (staff QC and automated checks never count): evaluate explainable risk rules with thresholds from `app_settings.risk_thresholds`:
   `rapid_repeat`, `many_networks`, `many_countries`, `high_lifetime`, and for revoked credentials `revoked_scans`.
   A repeat with enough score becomes `suspicious`.
6. Insert the event; update counters for recognized customer scans.
7. A suspicious result (or repeated presentation of a revoked credential) opens or escalates **one** investigation per unit.

The server then shapes the answer through an allow-list (`public-result.ts`): the browser receives the status, the
public serial, product name and photo, scan history in words, and approved recall text. Never network data,
internal ids, risk reasons or staff notes.

### HTTP contract (`POST /api/verify`)

| Status | Meaning |
|---|---|
| 200 | A verdict from the database (`recognized_*`, `suspicious`, `recalled`, `quarantined`, `not_released`, `retired`, `revoked`) |
| 404 | `invalid`: no such credential. Intentional REST semantics; the browser logs it as a failed fetch, the page handles it |
| 400 / 413 / 415 | Malformed body, too large (2 KB cap), wrong content type |
| 429 | Rate limited (`Retry-After`) |
| 503 | Database unavailable. The page says verification is temporarily unavailable and **does not** claim the part is invalid |
| 500 | Internal error with a reference to quote |

Responses are `Cache-Control: no-store`. The client (`normalizeVerifyResponse`) never trusts the shape of a
response: an unknown status degrades to an honest error state, never a verdict.

## Label pipeline

`create_label_job` allocates units and a job. `processNextChunk` (called from the browser, resumable, and also
from the cron route for abandoned jobs) takes the next chunk with `FOR UPDATE SKIP LOCKED`, generates tokens and
codes, renders that chunk's labels into a vector PDF (the QR is written as a raw content stream, so it stays
crisp at any printer resolution), stores the PDF, and commits **tokens and artifact together**: if anything in a
chunk fails, nothing from it is issued. PDFs live in a private bucket, expire (default 14 days) and are purged,
and every download is authorized, rate-limited and audited. A generated PDF cannot be recreated (the tokens are
not stored); lost labels are replaced, not regenerated (see [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md)).

## Authentication and authorization

* Supabase Auth with email + password, PKCE, `@supabase/ssr` httpOnly cookies. No browser-side Supabase client exists; there are no `NEXT_PUBLIC_*` variables.
* TOTP MFA. An **enrolled** factor is always enforced; policy (`REQUIRE_MFA_FOR_PRIVILEGED`) additionally forces owners and admins to enrol.
* Roles: `owner`, `admin`, `production_operator`, `warehouse_operator`, `support_agent`, `auditor`. The permission table is in `src/server/auth/permissions.ts`; the independent expectation is in `tests/e2e/rbac.spec.ts`.
* Separation of duties: the people who print and apply labels can pass QC but **cannot release** stock.
* Database defense in depth: Row Level Security is enabled on every table; staff (`authenticated`) get read-only, role-scoped `SELECT` and nothing else; `app_server` cannot read token hashes (column-level grants) and cannot write units, tokens, events or audit rows directly.

## Failure behavior

If the database is unavailable the public page says so. It never shows "invalid" for an outage, never serves
a cached verdict, and never invents one. Settings fall back to neutral defaults for marketing pages only;
verification does not depend on them. A misconfigured production deploy logs which settings are wrong (never
their values).
