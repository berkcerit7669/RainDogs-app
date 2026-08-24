begin;

-- The events SELECT policy references event_charters. Authenticated sessions
-- need table access so PostgreSQL can evaluate that existing RLS-protected link.
grant select on table public.event_charters to authenticated;

commit;
