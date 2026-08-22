-- Secure nick login support. Run once after schema.sql.

create unique index if not exists profiles_nick_case_insensitive_unique
  on public.profiles (lower(trim(nick)));

create table if not exists public.auth_login_limits (
  key_hash text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_login_limits enable row level security;
revoke all on public.auth_login_limits from anon, authenticated;

create or replace function public.consume_nick_login_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.auth_login_limits;
begin
  if p_key_hash is null or length(p_key_hash) < 32 then return false; end if;

  insert into public.auth_login_limits(key_hash, attempts)
  values (p_key_hash, 1)
  on conflict (key_hash) do update
    set attempts = case
      when auth_login_limits.window_started_at < now() - interval '15 minutes' then 1
      else auth_login_limits.attempts + 1
    end,
    window_started_at = case
      when auth_login_limits.window_started_at < now() - interval '15 minutes' then now()
      else auth_login_limits.window_started_at
    end,
    updated_at = now()
  returning * into v_row;

  return v_row.attempts <= 5;
end;
$$;

create or replace function public.clear_nick_login_attempts(p_key_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_login_limits where key_hash = p_key_hash;
$$;

revoke all on function public.consume_nick_login_attempt(text) from public, anon, authenticated;
revoke all on function public.clear_nick_login_attempts(text) from public, anon, authenticated;
grant execute on function public.consume_nick_login_attempt(text) to service_role;
grant execute on function public.clear_nick_login_attempts(text) to service_role;

