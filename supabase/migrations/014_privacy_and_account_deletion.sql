begin;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested','cancelled','rejected','completed')),
  reason text not null default '',
  decision_note text not null default '',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_requests_one_open
  on public.account_deletion_requests(member_id) where status='requested';
create index if not exists account_deletion_requests_status_created
  on public.account_deletion_requests(status,created_at desc);

alter table public.account_deletion_requests enable row level security;
drop policy if exists account_deletion_requests_self_read on public.account_deletion_requests;
create policy account_deletion_requests_self_read on public.account_deletion_requests
  for select to authenticated using (member_id=auth.uid() or public.is_app_admin());
drop policy if exists account_deletion_requests_self_insert on public.account_deletion_requests;
create policy account_deletion_requests_self_insert on public.account_deletion_requests
  for insert to authenticated with check (member_id=auth.uid() and status='requested');

revoke all on public.account_deletion_requests from anon;
grant select,insert on public.account_deletion_requests to authenticated;

commit;
