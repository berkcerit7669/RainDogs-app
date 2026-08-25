begin;

create table if not exists public.membership_milestones (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  milestone text not null check (milestone in ('hangaround','prospect','member')),
  occurred_on date not null,
  recorded_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(member_id, milestone)
);
alter table public.membership_milestones enable row level security;
revoke all on public.membership_milestones from anon, authenticated;
grant all privileges on public.membership_milestones to service_role;

create table if not exists public.role_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  role_scope text not null check (role_scope in ('charter','national')),
  role_name text not null,
  started_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now()
);
alter table public.role_history enable row level security;
revoke all on public.role_history from anon, authenticated;
grant all privileges on public.role_history to service_role;
create index if not exists role_history_member_idx on public.role_history(member_id);

create table if not exists public.member_badges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  note text,
  awarded_by uuid references public.profiles(id),
  awarded_at timestamptz not null default now()
);
alter table public.member_badges enable row level security;
revoke all on public.member_badges from anon, authenticated;
grant all privileges on public.member_badges to service_role;

commit;
