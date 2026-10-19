# Backup and recovery

## The one thing to understand

**The database is the only thing that can recognize a label.** A printed QR code contains a secret that exists
nowhere else; the database stores only its hash. If the database is lost and cannot be restored, *every label
in the field stops verifying*, and the secrets cannot be re-derived or regenerated. Backups are therefore a
core part of the product, not an operational nicety.

## What needs protecting

| Data | Where | Recoverable if lost? |
|---|---|---|
| Products, batches, units, token **hashes**, scan history, recalls, investigations, support cases, audit log, settings | PostgreSQL (`public`) | Only from a backup |
| Staff accounts and MFA factors | PostgreSQL (`auth`, managed by Supabase Auth) | Only from a backup (or re-invite, but then roles/memberships must match) |
| Product photos and the logo | Storage `product-images` | Re-upload from your own originals |
| Label PDFs | Storage `label-artifacts` (private, expire in 14 days) | **No, by design.** Tokens are not stored. Use *Replace label* for affected units |
| Secrets and configuration | Vercel/Supabase environment | From your secret manager (keep an offline copy) |
| `NETWORK_HASH_PEPPER` | Vercel environment | Losing it only breaks continuity of "same network" comparisons |

## Backups

1. **Enable point-in-time recovery** on the Supabase project (**verify** the plan; PITR is a paid feature) and
   set the retention window to at least your incident-detection time.
2. **Also take an independent, encrypted logical backup** on a schedule (at least daily), stored outside the
   Supabase project and, ideally, outside the same cloud account:

   ```bash
   pg_dump "$DATABASE_ADMIN_URL" --format=custom --no-owner --schema=public --schema=auth \
     --file=authenticity-$(date -u +%Y%m%dT%H%MZ).dump
   age -r <recipient-public-key> -o authenticity-….dump.age authenticity-….dump   # or gpg
   ```
3. Backups contain **token hashes, personal data (support messages, staff emails) and the audit log**. Encrypt
   them, restrict access to the few people who could also read the database, and apply your retention policy
   to the backups themselves (data you purged from the live database must age out of backups too).
4. Test that the backup is complete and restorable: **a backup that has never been restored is a hope, not a
   backup.**

## Recovery objectives (you decide)

Write down and agree **RPO** (how much data you can lose) and **RTO** (how long verification may be down).
Reference points: with PITR the RPO is typically minutes; a daily dump gives up to 24 hours. Every scan in the
lost window is gone (support/audit entries too); labels generated in the lost window **will not verify** and
must be replaced.

## What has and has not been exercised

**Run by the author, on a local PostgreSQL 16:** a custom-format `pg_dump` of the development database (4,078
units, 3,686 tokens, 945 scan events, 613 audit entries, 12 Auth users) restored with `pg_restore --no-owner` into
a fresh database in under a second. Afterwards: every table count matched; a real sample label verified as
*recognized* through the `app_verifier` role; that role was still refused direct table access; the append-only
audit trigger and the last-owner trigger were present and enforcing.

**Not exercised** (do these in your own environment): Supabase point-in-time recovery, restoring the `auth` schema
into a managed Supabase project, restoring through the Supabase pooler, Storage object recovery, and timing at
production data volumes.

## Restore drill (do this before launch and then on a schedule)

Use a scratch Supabase project or a local PostgreSQL. Never drill against production.

1. Create an empty project (or database). Apply the migrations so roles, grants and functions exist:
   `DATABASE_ADMIN_URL=… pnpm db:migrate`.
2. Restore the **data** from the backup (`pg_restore --data-only --disable-triggers …`, or use the Supabase
   restore tooling). Triggers that enforce state machines should be re-enabled afterwards; do not leave
   `session_replication_role = replica` on.
3. Set passwords for `app_server` and `app_verifier` (they are roles, not data):
   `alter role app_server login password '…';` and the same for `app_verifier`.
4. Point a staging deployment at it and verify:
   * Sign in as an owner; the dashboard counts match the production figures you recorded.
   * Scan a few **known sample labels** (keep a small, sealed set of real labels or recorded tokens for exactly
     this purpose) and confirm they answer *Code recognized*; confirm a revoked one says *no longer valid*.
   * The audit log and scan history are continuous up to the recovery point.
5. Record the elapsed time (your measured RTO) and anything that surprised you.

## If the production database is gone and there is no usable backup

This is the worst case and cannot be fully recovered:

1. Put a status notice up (customers already see "Verification is temporarily unavailable. This does not mean
   the part is invalid." for outages; for a *permanent* loss, change the public copy deliberately).
2. For stock not yet shipped: regenerate labels (new tokens) and replace.
3. For stock in the field: there is no way to rebuild the secrets. Decide with your business whether to
   re-label (*replace labels*), run a customer notice, or accept that old labels cannot be verified.

## What the system does when the database is down

It says so. The public page reports temporary unavailability (HTTP 503) and explicitly states it does not mean
the part is invalid. It never reports a part as invalid, genuine or recalled without an answer from the
database, and never serves a cached verdict.
