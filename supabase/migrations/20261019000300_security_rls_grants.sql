-- =============================================================================
-- Security model: roles, least-privilege grants, Row Level Security, storage.
--
--   anon / authenticated  Supabase Data API roles. The browser holds the anon
--                         key, so these roles get the bare minimum: staff may
--                         READ what their role allows; nobody can write.
--   app_server            Used by the Next.js server for admin operations.
--                         Writes to sensitive tables go through SECURITY DEFINER
--                         functions only.
--   app_verifier          Used by the public verification path. May execute
--                         exactly two functions and touch no table directly.
--
-- Operators must `alter role app_server login password '...'` (and the same for
-- app_verifier) in each environment; see docs/DEPLOYMENT.md.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_server') then
    create role app_server nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_verifier') then
    create role app_verifier nologin;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Staff helper functions (private schema: not exposed by the Data API)
-- -----------------------------------------------------------------------------
create or replace function app_private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.admin_memberships m
  where m.user_id = (select auth.uid()) and m.status = 'active'
$$;

create or replace function app_private.staff_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select app_private.staff_role()) = any (p_roles), false)
$$;

revoke all on function app_private.staff_role() from public;
revoke all on function app_private.staff_has_role(text[]) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.staff_role() to authenticated;
grant execute on function app_private.staff_has_role(text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Start from zero for the Data API roles.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere (a table without policies is closed to non-owners).
-- -----------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.admin_memberships enable row level security;
alter table public.products enable row level security;
alter table public.manufacturing_batches enable row level security;
alter table public.part_units enable row level security;
alter table public.part_tokens enable row level security;
alter table public.label_jobs enable row level security;
alter table public.label_job_units enable row level security;
alter table public.label_job_artifacts enable row level security;
alter table public.label_events enable row level security;
alter table public.verification_events enable row level security;
alter table public.recalls enable row level security;
alter table public.recall_products enable row level security;
alter table public.recall_batches enable row level security;
alter table public.recall_units enable row level security;
alter table public.investigations enable row level security;
alter table public.investigation_notes enable row level security;
alter table public.support_cases enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_counters enable row level security;

-- -----------------------------------------------------------------------------
-- Data API (authenticated staff): read-only, role-scoped. No writes, ever.
-- part_tokens, label_job_units, label_job_artifacts and rate_limit_counters
-- have NO grant and NO policy for these roles.
-- -----------------------------------------------------------------------------
grant select on public.app_settings, public.admin_memberships, public.products,
  public.manufacturing_batches, public.part_units, public.label_jobs, public.label_events,
  public.recalls, public.recall_products, public.recall_batches, public.recall_units,
  public.investigations, public.investigation_notes, public.support_cases, public.audit_logs
  to authenticated;
-- Network identifiers are never readable through the Data API.
grant select (id, unit_id, token_id, result, channel, credential_kind, request_id, country, ua_class,
              risk_score, risk_reasons, created_at)
  on public.verification_events to authenticated;

create policy staff_read_settings on public.app_settings for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_memberships on public.admin_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.staff_has_role(array['owner', 'admin'])));
create policy staff_read_products on public.products for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_batches on public.manufacturing_batches for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_units on public.part_units for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_label_jobs on public.label_jobs for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'production_operator', 'warehouse_operator', 'auditor'])));
create policy staff_read_label_events on public.label_events for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'production_operator', 'warehouse_operator', 'auditor'])));
create policy staff_read_verification_events on public.verification_events for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'support_agent', 'auditor'])));
create policy staff_read_recalls on public.recalls for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_recall_products on public.recall_products for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_recall_batches on public.recall_batches for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_recall_units on public.recall_units for select to authenticated
  using ((select app_private.staff_role()) is not null);
create policy staff_read_investigations on public.investigations for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'support_agent', 'auditor'])));
create policy staff_read_investigation_notes on public.investigation_notes for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'support_agent', 'auditor'])));
create policy staff_read_support_cases on public.support_cases for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'support_agent', 'auditor'])));
create policy staff_read_audit_logs on public.audit_logs for select to authenticated
  using ((select app_private.staff_has_role(array['owner', 'admin', 'auditor'])));

-- -----------------------------------------------------------------------------
-- app_server: server-side admin operations. Policies are permissive because
-- authorisation (role permissions) is enforced in application code and the
-- grants below are what bound the blast radius.
-- -----------------------------------------------------------------------------
grant usage on schema public to app_server, app_verifier;
grant usage on sequence public.investigation_ref_seq, public.support_ref_seq, public.recall_ref_seq to app_server;

grant select, update on public.app_settings to app_server;
grant select, insert, update, delete on public.admin_memberships to app_server;
grant select, insert, update on public.products to app_server;
grant select, insert on public.manufacturing_batches to app_server;
grant update (manufacturing_date, expected_quantity, processing_status, qc_notes, notes)
  on public.manufacturing_batches to app_server;
grant select on public.part_units to app_server;
-- Token hashes are deliberately unreadable by the admin application.
grant select (id, unit_id, status, label_job_id, issued_by, issued_at, revoked_at, revoked_by,
              revocation_reason, replaced_by_token_id)
  on public.part_tokens to app_server;
grant select, update on public.label_jobs to app_server;
grant select, update on public.label_job_units to app_server;
grant select, insert, update on public.label_job_artifacts to app_server;
grant select on public.label_events to app_server;
grant select on public.verification_events to app_server;
grant select, insert, update on public.recalls to app_server;
grant select, insert, delete on public.recall_products, public.recall_batches, public.recall_units to app_server;
grant select, insert, update on public.investigations to app_server;
grant select, insert on public.investigation_notes to app_server;
grant select, insert, update on public.support_cases to app_server;
grant select, insert on public.audit_logs to app_server;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'admin_memberships', 'products', 'manufacturing_batches', 'part_units', 'part_tokens',
    'label_jobs', 'label_job_units', 'label_job_artifacts', 'label_events', 'verification_events', 'recalls',
    'recall_products', 'recall_batches', 'recall_units', 'investigations', 'investigation_notes',
    'support_cases', 'audit_logs'
  ] loop
    execute format('create policy app_server_all on public.%I for all to app_server using (true) with check (true)', t);
  end loop;
end
$$;

-- Function execution: explicit allow-list. (Revoked from PUBLIC above.)
grant execute on function
  public.register_batch_units(uuid, integer),
  public.issue_part_tokens(uuid, uuid[], bytea[], bytea[], uuid),
  public.replace_part_token(uuid, bytea, bytea, uuid, text, uuid),
  public.revoke_part_token(uuid, uuid, text),
  public.set_label_status(uuid[], text, uuid, text),
  public.report_label_damage(uuid, uuid, text),
  public.transition_units(text, uuid, text, uuid, uuid[]),
  public.set_batch_qc_hold(uuid, boolean),
  public.create_label_job(uuid, text, integer, text, jsonb, uuid, uuid[], integer),
  public.verify_part_token(bytea, text, text, text, bytea, text, text, uuid),
  public.rate_limit_hit(text, integer, integer),
  public.purge_expired_data()
  to app_server;

grant execute on function
  public.verify_part_token(bytea, text, text, text, bytea, text, text, uuid),
  public.rate_limit_hit(text, integer, integer)
  to app_verifier;

-- -----------------------------------------------------------------------------
-- Storage buckets (only when running on Supabase).
--   product-images  public, small images only
--   label-artifacts private; accessed exclusively with the service role
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('label-artifacts', 'label-artifacts', false, 104857600, array['application/pdf'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;
