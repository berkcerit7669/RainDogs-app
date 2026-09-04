create table if not exists public.event_reads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique(event_id, member_id)
);
alter table public.event_reads enable row level security;
revoke all on public.event_reads from anon, authenticated;
grant all privileges on public.event_reads to service_role;
create index if not exists event_reads_event_idx on public.event_reads(event_id);
