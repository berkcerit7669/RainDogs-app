begin;

create table if not exists public.clubhouse_states (
  charter_id uuid primary key references public.charters(id) on delete cascade,
  status text not null default 'available' check (status in ('available','busy')),
  note text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.clubhouse_states enable row level security;

drop policy if exists clubhouse_states_read on public.clubhouse_states;
create policy clubhouse_states_read on public.clubhouse_states
  for select using (
    exists(select 1 from public.profiles where id=auth.uid() and account_status='active')
  );

drop policy if exists clubhouse_states_manage on public.clubhouse_states;
create policy clubhouse_states_manage on public.clubhouse_states
  for all using (public.is_national() or public.is_charter_manager(charter_id))
  with check (public.is_national() or public.is_charter_manager(charter_id));

grant select,insert,update,delete on public.clubhouse_states to authenticated;
grant all privileges on public.clubhouse_states to service_role;

commit;
