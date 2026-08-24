begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_member_id_idx
  on public.push_subscriptions(member_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;

create table if not exists public.password_recovery_limits (
  key_hash text primary key,
  attempt_count integer not null default 1,
  window_started_at timestamptz not null default now()
);

alter table public.password_recovery_limits enable row level security;
revoke all on table public.password_recovery_limits from anon, authenticated;

create or replace function public.consume_password_recovery_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.password_recovery_limits%rowtype;
begin
  select * into row_data
  from public.password_recovery_limits
  where key_hash = p_key_hash
  for update;

  if not found or row_data.window_started_at < now() - interval '30 minutes' then
    insert into public.password_recovery_limits(key_hash, attempt_count, window_started_at)
    values (p_key_hash, 1, now())
    on conflict (key_hash) do update
      set attempt_count = 1, window_started_at = now();
    return true;
  end if;

  if row_data.attempt_count >= 3 then return false; end if;
  update public.password_recovery_limits
    set attempt_count = attempt_count + 1
    where key_hash = p_key_hash;
  return true;
end;
$$;

revoke all on function public.consume_password_recovery_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_password_recovery_attempt(text) to service_role;

commit;
