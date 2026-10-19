-- Reissue jobs must record why credentials are being replaced.
alter table public.label_jobs add column if not exists reason text check (char_length(reason) <= 500);
alter table public.label_jobs add constraint label_jobs_reissue_reason
  check (kind <> 'reissue' or (reason is not null and char_length(btrim(reason)) >= 3)) not valid;
alter table public.label_jobs validate constraint label_jobs_reissue_reason;

-- create_label_job gains a reason parameter (old signature removed so it cannot be called without one).
drop function if exists public.create_label_job(uuid, text, integer, text, jsonb, uuid, uuid[], integer);
create or replace function public.create_label_job(
  p_batch_id uuid,
  p_kind text,
  p_quantity integer,
  p_idempotency_key text,
  p_label_spec jsonb,
  p_actor uuid,
  p_unit_ids uuid[] default null,
  p_chunk_size integer default 500,
  p_reason text default null
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
  if p_kind = 'reissue' and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception 'a reason is required to reissue labels' using errcode = '22023';
  end if;

  insert into public.label_jobs (batch_id, kind, requested_quantity, label_spec, idempotency_key, created_by, chunk_size, reason)
  values (p_batch_id, p_kind, greatest(p_quantity, 1), p_label_spec, p_idempotency_key, p_actor, p_chunk_size, p_reason)
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

revoke all on function public.create_label_job(uuid, text, integer, text, jsonb, uuid, uuid[], integer, text) from public, anon, authenticated;
grant execute on function public.create_label_job(uuid, text, integer, text, jsonb, uuid, uuid[], integer, text) to app_server;
