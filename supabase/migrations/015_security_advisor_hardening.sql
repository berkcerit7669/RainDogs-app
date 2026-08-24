begin;

-- Attendance finalization is exposed only through the authenticated app-api
-- endpoint, where the complete role matrix and charter scope are enforced.
-- Direct RPC execution would duplicate that privileged surface.
revoke all on function public.finalize_event_attendance(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_event_attendance(uuid)
  to service_role;

commit;
