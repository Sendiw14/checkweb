-- Releasing units one by one (or by list) must also move their batch to 'released'.
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

  -- Releasing individual units also authorises their batch (once), so batch status never lags behind reality.
  if p_to = 'released' and p_batch_id is null and v_changed > 0 then
    update public.manufacturing_batches b
       set release_status = 'released', approved_by = coalesce(b.approved_by, p_actor),
           approved_at = coalesce(b.approved_at, now()), released_at = coalesce(b.released_at, now())
     where b.release_status = 'pending'
       and exists (select 1 from public.part_units u where u.batch_id = b.id and u.lifecycle_status = 'released');
  end if;

  return jsonb_build_object('requested', v_requested, 'changed', v_changed, 'skipped', v_requested - v_changed);
end;
$$;

-- Re-assert privileges (CREATE OR REPLACE keeps them, but be explicit and idempotent).
revoke all on function public.transition_units(text, uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.transition_units(text, uuid, text, uuid, uuid[]) to app_server;

-- Repair existing data created before this rule existed.
update public.manufacturing_batches b
   set release_status = 'released', approved_at = coalesce(b.approved_at, now()), released_at = coalesce(b.released_at, now())
 where b.release_status = 'pending'
   and exists (select 1 from public.part_units u where u.batch_id = b.id and u.lifecycle_status = 'released');
