-- finalize_event_attendance relied on auth.uid() for its permission check
-- and for stamping marked_by/submitted_by/approved_by. When called from
-- the app-api Edge Function via the service-role client (ctx.supabaseAdmin),
-- there is no end-user JWT session, so auth.uid() evaluates to null there.
-- That made the function's own "is_national() or is_charter_manager()"
-- check fail for every caller regardless of role, always raising
-- 'forbidden' -- independent of and in addition to app-api's own
-- (correct) permission check before calling this RPC.
--
-- Accept the acting member's id explicitly instead, defaulting to
-- auth.uid() so any direct end-user call (with their own session) keeps
-- working unchanged.
drop function if exists public.finalize_event_attendance(uuid);

create or replace function public.finalize_event_attendance(p_event_id uuid, p_actor_id uuid default auth.uid())
returns integer language plpgsql security definer set search_path=public as $$
declare v_event public.events; v_count integer;
begin
  select * into v_event from public.events where id=p_event_id for update;
  if not (public.is_national(p_actor_id) or public.is_charter_manager(v_event.owner_charter_id, p_actor_id)) then raise exception 'forbidden'; end if;
  if coalesce(v_event.distance_km,0)=0 then raise exception 'distance_required'; end if;
  update public.attendance set finalized=true, marked_by=p_actor_id, marked_at=now() where event_id=p_event_id;
  insert into public.km_entries(member_id,event_id,route_name,km,status,submitted_by,approved_by)
    select member_id,p_event_id,v_event.title,v_event.distance_km,'active',p_actor_id,p_actor_id
    from public.attendance where event_id=p_event_id and status='attended'
    on conflict(event_id,member_id) do nothing;
  update public.attendance set km_credited=v_event.distance_km where event_id=p_event_id and status='attended' and km_credited=0;
  get diagnostics v_count=row_count; return v_count;
end $$;

revoke all on function public.finalize_event_attendance(uuid, uuid) from public;
grant execute on function public.finalize_event_attendance(uuid, uuid) to authenticated, service_role;
