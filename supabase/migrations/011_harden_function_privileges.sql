begin;

-- RLS helper functions are used internally by authenticated policies. PostgreSQL
-- grants EXECUTE to PUBLIC by default, which also exposes them to anonymous RPC.
revoke all on function public.is_national(uuid) from public, anon;
revoke all on function public.is_charter_manager(uuid, uuid) from public, anon;
revoke all on function public.can_review_membership(uuid) from public, anon;
revoke all on function public.is_board_member(uuid) from public, anon;
revoke all on function public.has_charter_role(text[], uuid, uuid) from public, anon;
revoke all on function public.finalize_event_attendance(uuid) from public, anon;

grant execute on function public.is_national(uuid) to authenticated, service_role;
grant execute on function public.is_charter_manager(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_review_membership(uuid) to authenticated, service_role;
grant execute on function public.is_board_member(uuid) to authenticated, service_role;
grant execute on function public.has_charter_role(text[], uuid, uuid) to authenticated, service_role;
grant execute on function public.finalize_event_attendance(uuid) to authenticated, service_role;

-- This event-trigger helper must never be callable through the Data API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

commit;
