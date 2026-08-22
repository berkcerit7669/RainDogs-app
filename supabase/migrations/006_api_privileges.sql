-- Minimal API privileges required by nick login and profile bootstrap.
-- RLS remains the authorization boundary for authenticated users.

begin;

grant usage on schema public to authenticated, service_role;

grant select on table public.profiles, public.charters to authenticated;
grant select on table public.profiles, public.charters to service_role;

-- Edge Functions use these RPCs through the service role.
grant execute on function public.consume_nick_login_attempt(text) to service_role;
grant execute on function public.clear_nick_login_attempts(text) to service_role;

commit;
