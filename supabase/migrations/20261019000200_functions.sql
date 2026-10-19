-- =============================================================================
-- Guards (triggers) and transactional functions.
--
-- Everything that mutates sensitive state (units, tokens, events) goes through
-- one of these functions so each operation is atomic and the least-privileged
-- application roles never need direct write access to those tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Guard: the last active owner cannot be removed, demoted or suspended.
-- -----------------------------------------------------------------------------
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    if not exists (
      select 1 from public.admin_memberships m
      where m.role = 'owner' and m.status = 'active' and m.user_id <> old.user_id
    ) then
      raise exception 'cannot remove, demote or suspend the last active owner'
        using errcode = 'P0001', hint = 'promote another owner first';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger admin_memberships_last_owner
  before update or delete on public.admin_memberships
  for each row execute function public.guard_last_owner();

-- -----------------------------------------------------------------------------
-- Guard: part_units immutability + lifecycle / label state machines.
-- -----------------------------------------------------------------------------
create or replace function public.guard_part_unit_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_batch_status text;
begin
  if new.product_id is distinct from old.product_id
     or new.batch_id is distinct from old.batch_id
     or new.serial_number is distinct from old.serial_number then
    raise exception 'product, batch and serial number of a unit are immutable' using errcode = 'P0001';
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    if not (
      (old.lifecycle_status = 'registered' and new.lifecycle_status in ('qc_passed', 'quarantined', 'retired')) or
      (old.lifecycle_status = 'qc_passed'  and new.lifecycle_status in ('released', 'quarantined', 'retired')) or
      (old.lifecycle_status = 'released'   and new.lifecycle_status in ('quarantined', 'retired')) or
      (old.lifecycle_status = 'quarantined' and new.lifecycle_status in ('registered', 'qc_passed', 'released', 'retired'))
    ) then
      raise exception 'illegal lifecycle transition % -> %', old.lifecycle_status, new.lifecycle_status
        using errcode = 'P0001';
    end if;

    if new.lifecycle_status = 'released' then
      select release_status into v_batch_status from public.manufacturing_batches where id = new.batch_id;
      if v_batch_status in ('qc_hold', 'quarantined') then
        raise exception 'batch is on % and cannot release units', v_batch_status using errcode = 'P0001';
      end if;
      if new.label_status <> 'applied' then
        raise exception 'a unit cannot be released before its label is confirmed as applied' using errcode = 'P0001';
      end if;
      if not exists (select 1 from public.part_tokens t where t.unit_id = new.id and t.status = 'active') then
        raise exception 'a unit cannot be released without an active token' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if new.label_status is distinct from old.label_status then
    -- Forward only, except that (re)issuing a token may reset to 'issued'.
    if not (
      (old.label_status = 'unlabelled' and new.label_status = 'issued') or
      (old.label_status = 'issued'     and new.label_status = 'printed') or
      (old.label_status = 'printed'    and new.label_status = 'applied') or
      (new.label_status = 'issued')
    ) then
      raise exception 'illegal label transition % -> %', old.label_status, new.label_status
        using errcode = 'P0001';
    end if;
  end if;

  if old.lifecycle_status = 'retired' and new.lifecycle_status = 'retired'
     and (new.label_status is distinct from old.label_status) then
    raise exception 'retired units cannot change label status' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger part_units_guard
  before update on public.part_units
  for each row execute function public.guard_part_unit_changes();

-- -----------------------------------------------------------------------------
-- Guard: tokens are immutable apart from a one-way revocation.
-- -----------------------------------------------------------------------------
create or replace function public.guard_part_token_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'tokens are never deleted' using errcode = 'P0001';
  end if;
  if new.unit_id is distinct from old.unit_id
     or new.token_hash is distinct from old.token_hash
     or new.code_hash is distinct from old.code_hash
     or new.issued_at is distinct from old.issued_at then
    raise exception 'token identity fields are immutable' using errcode = 'P0001';
  end if;
  if old.status <> 'active' and new.status is distinct from old.status then
    raise exception 'a revoked or replaced token can never be re-activated' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger part_tokens_guard
  before update or delete on public.part_tokens
  for each row execute function public.guard_part_token_changes();

-- -----------------------------------------------------------------------------
-- Guard: append-only tables (audit log, verification events).
-- Retention purges run through purge_expired_data() which sets a local flag.
-- -----------------------------------------------------------------------------
create or replace function public.guard_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('app.retention_purge', true), '') = 'on' and tg_table_name = 'verification_events' then
    if tg_op = 'UPDATE' then
      -- Only the privacy-sensitive columns may be scrubbed.
      if new.id is distinct from old.id or new.result is distinct from old.result
         or new.unit_id is distinct from old.unit_id or new.created_at is distinct from old.created_at then
        raise exception 'retention purge may only scrub network_hash and country' using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end;
$$;
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.guard_append_only();
create trigger verification_events_append_only
  before update or delete on public.verification_events
  for each row execute function public.guard_append_only();

-- -----------------------------------------------------------------------------
-- Guard: audit metadata must never carry credentials.
-- -----------------------------------------------------------------------------
create or replace function public.guard_audit_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_path_exists(new.metadata,
       '$.** ? (exists(@.token) || exists(@.password) || exists(@.secret) || exists(@.authorization) || exists(@.cookie) || exists(@.token_hash) || exists(@.code_hash))')
     or jsonb_path_exists(new.metadata, '$.** ? (@.type() == "string" && @ like_regex "^[A-Za-z0-9_-]{43}$")') then
    raise exception 'audit metadata must not contain credentials' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger audit_logs_metadata_guard
  before insert on public.audit_logs
  for each row execute function public.guard_audit_metadata();

-- -----------------------------------------------------------------------------
-- Register N new units for a batch (serial numbers come from a global sequence).
-- -----------------------------------------------------------------------------
create or replace function public.register_batch_units(p_batch_id uuid, p_quantity integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.manufacturing_batches;
  v_existing integer;
  v_prefix text;
  v_inserted integer;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'quantity must be between 1 and 100000' using errcode = '22023';
  end if;

  select * into v_batch from public.manufacturing_batches where id = p_batch_id for update;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;
  if v_batch.processing_status not in ('planned', 'in_production') then
    raise exception 'batch is % and cannot receive new units', v_batch.processing_status using errcode = 'P0001';
  end if;
  if v_batch.release_status in ('quarantined', 'qc_hold') then
    raise exception 'batch is % and cannot receive new units', v_batch.release_status using errcode = 'P0001';
  end if;

  select count(*) into v_existing from public.part_units where batch_id = p_batch_id;
  if v_existing + p_quantity > v_batch.expected_quantity then
    raise exception 'registering % units would exceed the expected quantity (% of % already registered)',
      p_quantity, v_existing, v_batch.expected_quantity using errcode = 'P0001';
  end if;

  select serial_prefix into v_prefix from public.app_settings where id;

  insert into public.part_units (product_id, batch_id, serial_number)
  select v_batch.product_id, v_batch.id, v_prefix || '-' || lpad(nextval('public.serial_seq')::text, 8, '0')
  from generate_series(1, p_quantity);
  get diagnostics v_inserted = row_count;

  if v_batch.processing_status = 'planned' then
    update public.manufacturing_batches set processing_status = 'in_production' where id = p_batch_id;
  end if;
  return v_inserted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Token issuance / replacement / revocation
-- -----------------------------------------------------------------------------
create or replace function public.issue_part_tokens(
  p_job_id uuid,
  p_unit_ids uuid[],
  p_token_hashes bytea[],
  p_code_hashes bytea[],
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := coalesce(array_length(p_unit_ids, 1), 0);
  v_inserted integer;
begin
  if v_count = 0 or v_count <> coalesce(array_length(p_token_hashes, 1), 0)
     or v_count <> coalesce(array_length(p_code_hashes, 1), 0) then
    raise exception 'unit, token and code arrays must have the same non-zero length' using errcode = '22023';
  end if;

  -- Lock units in a stable order to avoid deadlocks with concurrent operations.
  perform 1 from public.part_units where id = any(p_unit_ids) order by id for update;

  if exists (select 1 from public.part_units where id = any(p_unit_ids) and lifecycle_status = 'retired') then
    raise exception 'retired units cannot receive tokens' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.part_tokens where unit_id = any(p_unit_ids) and status = 'active') then
    raise exception 'one or more units already have an active token' using errcode = 'P0001';
  end if;

  insert into public.part_tokens (unit_id, token_hash, code_hash, label_job_id, issued_by)
  select u.unit_id, h.token_hash, c.code_hash, p_job_id, p_actor
  from unnest(p_unit_ids) with ordinality as u(unit_id, n)
  join unnest(p_token_hashes) with ordinality as h(token_hash, n) using (n)
  join unnest(p_code_hashes) with ordinality as c(code_hash, n) using (n);
  get diagnostics v_inserted = row_count;

  update public.part_units set label_status = 'issued'
  where id = any(p_unit_ids) and label_status = 'unlabelled';

  insert into public.label_events (unit_id, token_id, job_id, event_type, actor_id)
  select t.unit_id, t.id, p_job_id, 'issued', p_actor
  from public.part_tokens t
  where t.unit_id = any(p_unit_ids) and t.status = 'active';

  return v_inserted;
end;
$$;

create or replace function public.replace_part_token(
  p_unit_id uuid,
  p_token_hash bytea,
  p_code_hash bytea,
  p_actor uuid,
  p_reason text,
  p_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.part_units;
  v_old public.part_tokens;
  v_new_id uuid := gen_random_uuid();
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required to replace a token' using errcode = '22023';
  end if;
  select * into v_unit from public.part_units where id = p_unit_id for update;
  if not found then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  if v_unit.lifecycle_status = 'retired' then
    raise exception 'retired units cannot receive tokens' using errcode = 'P0001';
  end if;

  select * into v_old from public.part_tokens where unit_id = p_unit_id and status = 'active';
  if found then
    update public.part_tokens
       set status = 'replaced', revoked_at = now(), revoked_by = p_actor,
           revocation_reason = p_reason, replaced_by_token_id = v_new_id
     where id = v_old.id;
  end if;

  insert into public.part_tokens (id, unit_id, token_hash, code_hash, label_job_id, issued_by)
  values (v_new_id, p_unit_id, p_token_hash, p_code_hash, p_job_id, p_actor);

  -- A new credential means a new physical label that has not been applied yet.
  update public.part_units set label_status = 'issued' where id = p_unit_id and label_status <> 'issued';

  insert into public.label_events (unit_id, token_id, job_id, event_type, actor_id, note)
  values (p_unit_id, v_new_id, p_job_id, 'reissued', p_actor, left(p_reason, 500));
  return v_new_id;
end;
$$;

create or replace function public.revoke_part_token(p_unit_id uuid, p_actor uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required to revoke a token' using errcode = '22023';
  end if;
  perform 1 from public.part_units where id = p_unit_id for update;
  if not found then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  update public.part_tokens
     set status = 'revoked', revoked_at = now(), revoked_by = p_actor, revocation_reason = p_reason
   where unit_id = p_unit_id and status = 'active'
   returning id into v_token_id;
  if v_token_id is not null then
    insert into public.label_events (unit_id, token_id, event_type, actor_id, note)
    values (p_unit_id, v_token_id, 'revoked', p_actor, left(p_reason, 500));
  end if;
  return v_token_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Label status confirmations (printed / applied) and lifecycle transitions
-- -----------------------------------------------------------------------------
create or replace function public.set_label_status(
  p_unit_ids uuid[], p_to text, p_actor uuid, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_changed integer;
begin
  if p_to not in ('printed', 'applied') then
    raise exception 'label status can only be confirmed as printed or applied' using errcode = '22023';
  end if;
  v_from := case p_to when 'printed' then 'issued' else 'printed' end;

  with locked as (
    select id from public.part_units
    where id = any(p_unit_ids) and label_status = v_from and lifecycle_status <> 'retired'
    order by id for update
  ), changed as (
    update public.part_units u set label_status = p_to
    from locked l where u.id = l.id
    returning u.id
  )
  insert into public.label_events (unit_id, token_id, event_type, actor_id, note)
  select c.id,
         (select t.id from public.part_tokens t where t.unit_id = c.id and t.status = 'active'),
         p_to, p_actor, left(p_note, 500)
  from changed c;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create or replace function public.report_label_damage(p_unit_id uuid, p_actor uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.label_events (unit_id, token_id, event_type, actor_id, note)
  select u.id, (select t.id from public.part_tokens t where t.unit_id = u.id and t.status = 'active'),
         'damage_reported', p_actor, left(p_note, 500)
  from public.part_units u where u.id = p_unit_id;
end;
$$;

create or replace function public.transition_units(
  p_to text,
  p_actor uuid,
  p_reason text default null,
  p_batch_id uuid default null,
  p_unit_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested integer;
  v_changed integer := 0;
  v_batch public.manufacturing_batches;
begin
  if p_batch_id is null and p_unit_ids is null then
    raise exception 'a batch or an explicit unit list is required' using errcode = '22023';
  end if;
  if p_to not in ('qc_passed', 'released', 'quarantined', 'restored', 'retired') then
    raise exception 'unknown target %', p_to using errcode = '22023';
  end if;
  if p_to in ('quarantined', 'retired') and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  if p_batch_id is not null then
    select * into v_batch from public.manufacturing_batches where id = p_batch_id for update;
    if not found then
      raise exception 'batch not found' using errcode = 'P0002';
    end if;
  end if;

  select count(*) into v_requested from public.part_units u
  where (p_batch_id is null or u.batch_id = p_batch_id)
    and (p_unit_ids is null or u.id = any(p_unit_ids));

  if p_to = 'qc_passed' then
    update public.part_units u set lifecycle_status = 'qc_passed', qc_passed_at = now()
    where u.id in (
      select id from public.part_units
      where (p_batch_id is null or batch_id = p_batch_id) and (p_unit_ids is null or id = any(p_unit_ids))
        and lifecycle_status = 'registered' order by id for update);
  elsif p_to = 'released' then
    if p_batch_id is not null and v_batch.release_status in ('qc_hold', 'quarantined') then
      raise exception 'batch is on % and cannot be released', v_batch.release_status using errcode = 'P0001';
    end if;
    update public.part_units u set lifecycle_status = 'released', released_at = now()
    where u.id in (
      select x.id from public.part_units x
      where (p_batch_id is null or x.batch_id = p_batch_id) and (p_unit_ids is null or x.id = any(p_unit_ids))
        and x.lifecycle_status = 'qc_passed' and x.label_status = 'applied'
        and exists (select 1 from public.part_tokens t where t.unit_id = x.id and t.status = 'active')
        and exists (select 1 from public.manufacturing_batches b where b.id = x.batch_id and b.release_status not in ('qc_hold', 'quarantined'))
      order by x.id for update);
  elsif p_to = 'quarantined' then
    update public.part_units u
       set lifecycle_before_quarantine = u.lifecycle_status, lifecycle_status = 'quarantined',
           quarantined_at = now(), quarantine_reason = p_reason
    where u.id in (
      select id from public.part_units
      where (p_batch_id is null or batch_id = p_batch_id) and (p_unit_ids is null or id = any(p_unit_ids))
        and lifecycle_status in ('registered', 'qc_passed', 'released') order by id for update);
  elsif p_to = 'restored' then
    -- A batch-wide restore lifts the batch quarantine first so units can be re-released.
    if p_batch_id is not null then
      update public.manufacturing_batches set release_status = 'pending'
       where id = p_batch_id and release_status = 'quarantined';
    end if;
    update public.part_units u
       set lifecycle_status = case
             when u.lifecycle_before_quarantine = 'released'
                  and u.label_status = 'applied'
                  and exists (select 1 from public.part_tokens t where t.unit_id = u.id and t.status = 'active')
                  and exists (select 1 from public.manufacturing_batches b
                              where b.id = u.batch_id and b.release_status not in ('qc_hold', 'quarantined'))
               then 'released'
             when u.lifecycle_before_quarantine = 'released' then 'qc_passed'
             else u.lifecycle_before_quarantine end,
           lifecycle_before_quarantine = null, quarantined_at = null, quarantine_reason = null
    where u.id in (
      select id from public.part_units
      where (p_batch_id is null or batch_id = p_batch_id) and (p_unit_ids is null or id = any(p_unit_ids))
        and lifecycle_status = 'quarantined' order by id for update);
  else -- retired
    update public.part_units u set lifecycle_status = 'retired', retired_at = now(), retired_reason = p_reason,
           lifecycle_before_quarantine = null
    where u.id in (
      select id from public.part_units
      where (p_batch_id is null or batch_id = p_batch_id) and (p_unit_ids is null or id = any(p_unit_ids))
        and lifecycle_status <> 'retired' order by id for update);
  end if;
  get diagnostics v_changed = row_count;

  -- Keep the batch-level release state consistent with a batch-wide action.
  if p_batch_id is not null then
    if p_to = 'released' and v_changed > 0 then
      update public.manufacturing_batches
         set release_status = 'released', approved_by = coalesce(approved_by, p_actor),
             approved_at = coalesce(approved_at, now()), released_at = coalesce(released_at, now())
       where id = p_batch_id;
    elsif p_to = 'quarantined' then
      update public.manufacturing_batches set release_status = 'quarantined' where id = p_batch_id;
    elsif p_to = 'restored' then
      update public.manufacturing_batches
         set release_status = case when exists (
               select 1 from public.part_units where batch_id = p_batch_id and lifecycle_status = 'released')
             then 'released' else 'pending' end
       where id = p_batch_id and release_status = 'pending' and approved_at is not null;
    end if;
  end if;

  return jsonb_build_object('requested', v_requested, 'changed', v_changed, 'skipped', v_requested - v_changed);
end;
$$;

create or replace function public.set_batch_qc_hold(p_batch_id uuid, p_hold boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select release_status into v_status from public.manufacturing_batches where id = p_batch_id for update;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;
  if p_hold then
    if v_status <> 'pending' then
      raise exception 'only a pending batch can be placed on QC hold (current: %)', v_status using errcode = 'P0001';
    end if;
    update public.manufacturing_batches set release_status = 'qc_hold' where id = p_batch_id;
  else
    if v_status <> 'qc_hold' then
      raise exception 'batch is not on QC hold' using errcode = 'P0001';
    end if;
    update public.manufacturing_batches set release_status = 'pending' where id = p_batch_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Label jobs: atomic allocation of units to a job (idempotent by key)
-- -----------------------------------------------------------------------------
create or replace function public.create_label_job(
  p_batch_id uuid,
  p_kind text,
  p_quantity integer,
  p_idempotency_key text,
  p_label_spec jsonb,
  p_actor uuid,
  p_unit_ids uuid[] default null,
  p_chunk_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.label_jobs;
  v_batch public.manufacturing_batches;
  v_job_id uuid;
  v_allocated integer;
begin
  select * into v_existing from public.label_jobs where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('jobId', v_existing.id, 'created', false, 'allocated', v_existing.requested_quantity);
  end if;

  select * into v_batch from public.manufacturing_batches where id = p_batch_id for update;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002';
  end if;
  if v_batch.release_status in ('quarantined', 'qc_hold') then
    raise exception 'batch is % and cannot be labelled', v_batch.release_status using errcode = 'P0001';
  end if;
  if p_kind not in ('issue', 'reissue') then
    raise exception 'invalid job kind' using errcode = '22023';
  end if;
  if p_kind = 'reissue' and (p_unit_ids is null or array_length(p_unit_ids, 1) is null) then
    raise exception 'a reissue job requires explicit units' using errcode = '22023';
  end if;

  insert into public.label_jobs (batch_id, kind, requested_quantity, label_spec, idempotency_key, created_by, chunk_size)
  values (p_batch_id, p_kind, greatest(p_quantity, 1), p_label_spec, p_idempotency_key, p_actor, p_chunk_size)
  returning id into v_job_id;

  -- A unit may belong to at most one unfinished job.
  insert into public.label_job_units (job_id, unit_id, position)
  select v_job_id, c.id, row_number() over (order by c.serial_number)
  from (
    select u.id, u.serial_number
    from public.part_units u
    where u.batch_id = p_batch_id
      and u.lifecycle_status <> 'retired'
      and (p_unit_ids is null or u.id = any(p_unit_ids))
      and (p_kind = 'reissue' or not exists (select 1 from public.part_tokens t where t.unit_id = u.id and t.status = 'active'))
      and not exists (
        select 1 from public.label_job_units ju
        join public.label_jobs j on j.id = ju.job_id
        where ju.unit_id = u.id and j.id <> v_job_id and j.state in ('queued', 'running'))
    order by u.serial_number
    limit p_quantity
  ) c;
  get diagnostics v_allocated = row_count;

  if v_allocated = 0 then
    raise exception 'no eligible units to label in this batch' using errcode = 'P0001';
  end if;

  update public.label_jobs set requested_quantity = v_allocated where id = v_job_id;
  return jsonb_build_object('jobId', v_job_id, 'created', true, 'allocated', v_allocated);
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window, distributed through the database)
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  if p_window_seconds < 1 or p_limit < 1 or char_length(p_key) > 200 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_counters as c (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = c.count + 1
  returning c.count into v_count;

  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- THE verification function.
-- One transaction: lookup -> state checks -> risk rules -> event -> counters.
-- -----------------------------------------------------------------------------
create or replace function public.verify_part_token(
  p_hash bytea,
  p_kind text,
  p_channel text,
  p_request_id text,
  p_network_hash bytea default null,
  p_country text default null,
  p_ua_class text default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.part_tokens;
  v_unit public.part_units;
  v_batch public.manufacturing_batches;
  v_product public.products;
  v_recall public.recalls;
  v_thresholds jsonb;
  v_result text;
  v_event_id bigint;
  v_customer boolean := (p_channel = 'customer');
  v_reasons text[] := '{}'::text[];
  v_score integer := 0;
  v_prev_first timestamptz;
  v_prev_count integer;
  v_n integer;
  v_severity text;
  v_metadata jsonb := '{}'::jsonb;
begin
  if p_kind not in ('token', 'code') or p_channel not in ('customer', 'qc', 'automated')
     or p_hash is null or octet_length(p_hash) <> 32
     or p_request_id is null or char_length(p_request_id) not between 8 and 64 then
    raise exception 'invalid verification arguments' using errcode = '22023';
  end if;
  if p_actor is not null then
    v_metadata := jsonb_build_object('actor', p_actor);
  end if;

  if p_kind = 'token' then
    select * into v_token from public.part_tokens where token_hash = p_hash;
  else
    select * into v_token from public.part_tokens where code_hash = p_hash;
  end if;

  if not found then
    insert into public.verification_events
      (result, channel, credential_kind, request_id, network_hash, country, ua_class, metadata)
    values ('invalid', p_channel, p_kind, p_request_id, p_network_hash, upper(p_country), p_ua_class, v_metadata)
    returning id into v_event_id;
    return jsonb_build_object('result', 'invalid', 'eventId', v_event_id);
  end if;

  -- Serialise concurrent scans / revocations of the same unit, then re-read the
  -- token so a revocation that committed while we waited is honoured.
  select * into v_unit from public.part_units where id = v_token.unit_id for update;
  select * into v_token from public.part_tokens where id = v_token.id;
  select * into v_batch from public.manufacturing_batches where id = v_unit.batch_id;
  select * into v_product from public.products where id = v_unit.product_id;

  v_prev_first := v_unit.first_verified_at;
  v_prev_count := v_unit.scan_count;

  select * into v_recall from public.recalls r
  where r.status = 'active' and (
    exists (select 1 from public.recall_units ru where ru.recall_id = r.id and ru.unit_id = v_unit.id)
    or exists (select 1 from public.recall_batches rb where rb.recall_id = r.id and rb.batch_id = v_unit.batch_id)
    or exists (select 1 from public.recall_products rp where rp.recall_id = r.id and rp.product_id = v_unit.product_id))
  order by r.issued_at desc limit 1;

  select risk_thresholds into v_thresholds from public.app_settings where id;

  if v_token.status <> 'active' then
    v_result := 'revoked';
  elsif v_recall.id is not null then
    v_result := 'recalled';
  elsif v_unit.lifecycle_status = 'quarantined' or v_batch.release_status = 'quarantined' then
    v_result := 'quarantined';
  elsif v_unit.lifecycle_status = 'retired' then
    v_result := 'retired';
  elsif v_unit.lifecycle_status <> 'released' then
    v_result := 'not_released';
  elsif v_prev_count = 0 then
    v_result := 'recognized_first';
  else
    v_result := 'recognized_repeat';
  end if;

  -- ---- explainable risk rules (customer scans only) -------------------------
  if v_customer then
    if v_result in ('recognized_first', 'recognized_repeat') then
      -- R1 rapid_repeat: many scans of one unit in a short window.
      select count(*) + 1 into v_n from public.verification_events e
      where e.unit_id = v_unit.id and e.channel = 'customer'
        and e.created_at > now() - make_interval(mins => coalesce((v_thresholds ->> 'rapidWindowMinutes')::int, 10));
      if v_n >= coalesce((v_thresholds ->> 'rapidScans')::int, 5) then
        v_reasons := array_append(v_reasons, 'rapid_repeat'::text); v_score := v_score + 2;
      end if;

      -- R2 many_networks: the same unit seen from several distinct networks.
      select count(distinct nh) into v_n from (
        select e.network_hash as nh from public.verification_events e
        where e.unit_id = v_unit.id and e.channel = 'customer' and e.network_hash is not null
          and e.created_at > now() - make_interval(hours => coalesce((v_thresholds ->> 'networkWindowHours')::int, 24))
        union
        select p_network_hash where p_network_hash is not null
      ) x;
      if v_n >= coalesce((v_thresholds ->> 'distinctNetworks')::int, 3) then
        v_reasons := array_append(v_reasons, 'many_networks'::text); v_score := v_score + 2;
      end if;

      -- R3 many_countries: coarse locations that are hard to reconcile.
      select count(distinct c) into v_n from (
        select e.country as c from public.verification_events e
        where e.unit_id = v_unit.id and e.channel = 'customer' and e.country is not null
          and e.created_at > now() - make_interval(hours => coalesce((v_thresholds ->> 'networkWindowHours')::int, 24))
        union
        select upper(p_country) where p_country is not null
      ) y;
      if v_n >= coalesce((v_thresholds ->> 'distinctCountries')::int, 2) then
        v_reasons := array_append(v_reasons, 'many_countries'::text); v_score := v_score + 2;
      end if;

      -- R4 high_lifetime: unusually many total verifications.
      if v_prev_count + 1 >= coalesce((v_thresholds ->> 'lifetimeScans')::int, 50) then
        v_reasons := array_append(v_reasons, 'high_lifetime'::text); v_score := v_score + 1;
      end if;

      if v_result = 'recognized_repeat' and v_score >= coalesce((v_thresholds ->> 'suspiciousScore')::int, 2) then
        v_result := 'suspicious';
      end if;
    elsif v_result = 'revoked' then
      -- R5 revoked_scans: a withdrawn credential keeps being presented.
      select count(*) + 1 into v_n from public.verification_events e
      where e.unit_id = v_unit.id and e.channel = 'customer' and e.result = 'revoked'
        and e.created_at > now() - interval '24 hours';
      if v_n >= coalesce((v_thresholds ->> 'revokedScans24h')::int, 3) then
        v_reasons := array_append(v_reasons, 'revoked_scans'::text); v_score := v_score + 2;
      end if;
    end if;
  end if;

  insert into public.verification_events
    (unit_id, token_id, result, channel, credential_kind, request_id, network_hash, country, ua_class,
     risk_score, risk_reasons, metadata)
  values
    (v_unit.id, v_token.id, v_result, p_channel, p_kind, p_request_id, p_network_hash, upper(p_country), p_ua_class,
     v_score, v_reasons, v_metadata)
  returning id into v_event_id;

  -- ---- counters: customer verifications of a recognised, releasable unit ------
  if v_customer and v_result in ('recognized_first', 'recognized_repeat', 'suspicious') then
    update public.part_units
       set scan_count = scan_count + 1,
           first_verified_at = coalesce(first_verified_at, now()),
           last_verified_at = now()
     where id = v_unit.id;
  end if;

  -- ---- automatic investigations ----------------------------------------------
  if v_customer and (v_result = 'suspicious' or (v_result = 'revoked' and 'revoked_scans' = any (v_reasons))) then
    v_severity := case when v_score >= 4 then 'high' when v_result = 'suspicious' then 'medium' else 'low' end;
    -- One open case per unit; later scans merge their reasons and can escalate severity.
    insert into public.investigations as inv (unit_id, batch_id, origin, severity, summary, risk_reasons)
    values (v_unit.id, v_unit.batch_id, 'risk_rule', v_severity,
            'Automatic: ' || case when v_result = 'suspicious' then 'unusual repeat-scan pattern' else 'withdrawn credential presented repeatedly' end
              || ' (' || array_to_string(v_reasons, ', ') || ')',
            v_reasons)
    on conflict (unit_id) where unit_id is not null and status in ('open', 'in_review') do update
      set severity = case
            when array_position(array['low', 'medium', 'high']::text[], excluded.severity)
               > array_position(array['low', 'medium', 'high']::text[], inv.severity)
            then excluded.severity else inv.severity end,
          risk_reasons = (select coalesce(array_agg(distinct r order by r), '{}'::text[])
                          from unnest(inv.risk_reasons || excluded.risk_reasons) as r);
  end if;

  return jsonb_build_object(
    'result', v_result,
    'eventId', v_event_id,
    'channel', p_channel,
    'riskReasons', to_jsonb(v_reasons),
    'unit', jsonb_build_object(
      'serial', v_unit.serial_number,
      'firstVerifiedAt', v_prev_first,
      'previousScanCount', v_prev_count,
      'lifecycle', v_unit.lifecycle_status),
    'product', jsonb_build_object(
      'name', v_product.name,
      'partNumber', v_product.part_number,
      'brand', v_product.brand,
      'category', v_product.category,
      'imagePath', v_product.image_path),
    'recall', case when v_result = 'recalled' then jsonb_build_object(
      'reference', v_recall.reference,
      'title', v_recall.title,
      'instructions', v_recall.public_instructions,
      'issuedAt', v_recall.issued_at) else null end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Retention: scrub network identifiers and anonymise old support cases.
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ret jsonb;
  v_scrubbed integer;
  v_cases integer;
  v_limits integer;
begin
  select retention into v_ret from public.app_settings where id;

  perform pg_catalog.set_config('app.retention_purge', 'on', true);
  update public.verification_events
     set network_hash = null, country = null
   where created_at < now() - make_interval(days => coalesce((v_ret ->> 'verificationNetworkDays')::int, 90))
     and (network_hash is not null or country is not null);
  get diagnostics v_scrubbed = row_count;
  perform pg_catalog.set_config('app.retention_purge', 'off', true);

  update public.support_cases
     set contact_name = null, contact_email = null, contact_phone = null, serial_reference = null,
         message = '[removed by retention policy]', purged_at = now()
   where purged_at is null and purge_after is not null and purge_after < now()
     and status in ('resolved', 'closed');
  get diagnostics v_cases = row_count;

  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  get diagnostics v_limits = row_count;

  return jsonb_build_object('verificationEventsScrubbed', v_scrubbed, 'supportCasesAnonymised', v_cases, 'rateLimitRowsDeleted', v_limits);
end;
$$;

-- -----------------------------------------------------------------------------
-- Ensure support cases get a retention date from settings on creation.
-- -----------------------------------------------------------------------------
create or replace function public.set_support_case_purge_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
begin
  if new.purge_after is null then
    select coalesce((retention ->> 'supportCaseDays')::int, 365) into v_days from public.app_settings where id;
    new.purge_after := now() + make_interval(days => v_days);
  end if;
  return new;
end;
$$;
create trigger support_cases_purge_date before insert on public.support_cases
  for each row execute function public.set_support_case_purge_date();
