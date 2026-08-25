begin;

create table if not exists public.culture_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  position integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.culture_items enable row level security;
revoke all on public.culture_items from anon, authenticated;
grant all privileges on public.culture_items to service_role;

commit;
