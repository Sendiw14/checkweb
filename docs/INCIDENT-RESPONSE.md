# Incident response and token revocation

Plan these before you need them. Keep this page, the on-call list and a database administrator's access
somewhere that does not depend on the system being up.

## Vocabulary

| Term | Meaning for customers | Reversible? |
|---|---|---|
| **Revoke** a unit's code | The label says *"This code is no longer valid"*. The unit keeps its serial and history | No (a new code can be *issued*, the old one never returns) |
| **Replace label** | Revoke the old code **and** issue a new one in a new label job. The new label verifies once applied and (re)released | n/a |
| **Quarantine** a unit or batch | Customers see *"On hold, contact us before you use or sell it"* | Yes (*Restore*) |
| **Retire** a unit | *"Withdrawn from service"* | No |
| **Recall** | Customers see **exactly the wording staff approved**, for the units, batches or products in scope | Yes (close it) |

All of these are audited with who, when and why. Staff screens: *Part units → unit → ⋯*, *Batches → ⋯ → Quarantine batch*, *Recalls*.

## First 15 minutes: triage

1. **What do you think happened?** Choose the playbook below. If unsure, *quarantine* is the safe, reversible holding action for **stock that is not yet in customers' hands**.
2. **Preserve evidence.** Do not delete anything (you cannot delete audit or scan history anyway). Export the audit log and scan events for the period (Reports → CSV).
3. **Open an investigation** (*Investigations → New*, or from the unit) and keep notes there.
4. **Tell the people who need to know**: the owner(s), the person responsible for the label stock, and (where required) your customers or regulators. The software does not send notifications.

## Playbooks

### A. A single label looks cloned or suspicious (repeat-scan pattern)

Signal: a `suspicious` result, or an automatic investigation (*many networks*, *many countries*, *rapid repeats*).
These are **hints**. Ordinary explanations exist (a distributor scanning stock, a workshop checking a batch).

1. Open the investigation and the unit's scan history. Look at the pattern of countries, networks and times.
2. Ask the supply chain (who sold or scanned it) before concluding anything.
3. If it is benign: resolve as *Resolved: benign*; the unit continues to verify.
4. If a physical part is in hand and it is a counterfeit: *Resolved: counterfeit confirmed*, **revoke** the genuine unit's code if the cloned label could still be presented, and **replace** the label on the genuine part where possible. Keep the counterfeit as evidence.
5. If parts already in the field carry a code that is being abused and you cannot replace the labels, the remaining control is detection plus customer guidance; consider a recall notice scoped to the affected units.

### B. A label PDF or its download was leaked, mis-sent, or an account with `labels.download` was compromised

A leaked PDF contains **live tokens for every unit in that job**. It can be used to print counterfeit
labels that verify as *recognized* for any unit that is, or will be, released.

1. **Disable the account**: *Team → ⋯ → Suspend* (immediate; also revokes nothing else, so also reset its password and sign out its devices). Rotate Supabase keys if a service-role key may be exposed.
2. Find the job: *QR labels → job* and the *Audit log* (`label.download` entries show who, when, which file hash).
3. **Units that are not yet released** (typical: the leak is caught during printing): revoke their codes so the leaked PDF is worthless, then issue new labels (*Replace label*; or bulk, see the SQL below). Expire the old PDF (it expires and is purged automatically after 14 days; you may also delete the stored object in Supabase Storage).
4. **Units already released and sold:** a leaked PDF can be used to forge labels for those units. Revoking them would break genuine customers' parts. Decide with your business: monitor those units for repeat/abnormal scans, quarantine the *unsold* stock, and, if risk is real, plan replacement labels or a recall for the sold units.
5. Review how it leaked and tighten: fewer people with `labels.download`, a shorter file expiry (Settings → Retention), MFA for everyone who can download.

### C. A staff account is compromised

1. Suspend the account (*Team*), reset its password, sign out its devices (Account security → *Sign out other devices* does this for *your own* account; for another person, suspending blocks them on their next request regardless of any session).
2. Review `Audit log` for everything that account did (filter by actor). Look for downloads, releases, role changes, revocations, recalls, settings changes, exports.
3. If an **owner** account was compromised, other owners must review role grants and rotate secrets.

### D. Wrong stock was released, or a defect is found

1. *Quarantine* the batch or units. Customers see *"On hold"* immediately and the database refuses to treat them as releasable.
2. Decide: restore, retire, or recall. A **recall** shows only wording your quality/legal team approved; enter and approve it deliberately (Recalls → New → Activate). Active recalls take effect at the moment they are activated, for every unit in scope.

### E. The database or the whole app is unavailable

Customers see *"Verification is temporarily unavailable. This does not mean the part is invalid."* The system
never reports a part as invalid because of an outage. Restore service; see [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md).

## Bulk revocation (break-glass SQL)

The staff interface revokes **one unit at a time** (*Revoke code*). For an incident touching a whole batch or
job, a database administrator can use the same audited function the interface uses. Run it as the `postgres`
role (or another role allowed to execute it), **inside a transaction**, and check the counts before committing.

```sql
begin;

-- 1. Scope: the batch (or replace with an explicit list of unit ids / a label job's units).
create temp table scope as
  select u.id from public.part_units u
  join public.manufacturing_batches b on b.id = u.batch_id
  where b.batch_code = 'REPLACE-WITH-BATCH-CODE'
    and u.lifecycle_status <> 'released';          -- recommended: leave sold stock for a deliberate decision

-- 2. Revoke. The reason is mandatory and recorded; actor NULL means "a database administrator".
select count(public.revoke_part_token(id, null, 'IR-2026-0007: label PDF leaked, see investigation INV-…'))
  from scope;

-- 3. Check: this should show 0 active tokens for the scope and the same number of 'revoked' label events.
select count(*) filter (where t.status = 'active')  as still_active,
       count(*) filter (where t.status = 'revoked') as revoked
  from public.part_tokens t join scope s on s.id = t.unit_id;

commit;   -- or: rollback;
```

This procedure was dry-run against a test database (1,200 units revoked, 1,200 `revoked` label events written,
then rolled back). Each revocation is written to `label_events`; because the database administrator is not a
signed-in staff member, also record the action in your incident ticket.

Afterwards issue replacement codes through the interface for the affected units (*Part unit → Replace label*)
or a new label job for the batch, print, apply, QC and release as normal.

## What customers see during an incident

| Situation | Customer-facing result |
|---|---|
| Revoked code | *"This code is no longer valid. A replacement label may exist on the part. If this is the only code on it, please contact us."* |
| Quarantined | *"On hold. Please contact us before you use or sell it."* |
| Recalled | Your approved recall text, verbatim, plus support contact |
| Unknown code | *"We can't match this code"*, with no accusation |
| Outage | *"Verification is temporarily unavailable"*, explicitly not "invalid" |

## After the incident

* Write down what happened, what was revoked/replaced, what was *not* (and why), and who decided.
* Close the investigation with a resolution and notes (kept permanently).
* Update this page, permissions and the runbook with what you learned.
