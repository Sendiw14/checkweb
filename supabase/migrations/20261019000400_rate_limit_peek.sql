-- Read-only companion to rate_limit_hit: lets the public path refuse a client that
-- already exhausted its *invalid-attempt* budget without consuming more budget.
create or replace function public.rate_limit_peek(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
stable
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
  select c.count into v_count from public.rate_limit_counters c where c.key = p_key and c.window_start = v_start;
  return coalesce(v_count, 0) < p_limit;
end;
$$;

revoke all on function public.rate_limit_peek(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_peek(text, integer, integer) to app_server, app_verifier;
