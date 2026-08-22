begin;

alter table public.profiles
  add column if not exists requested_member_level public.member_level,
  add column if not exists requested_charter_role text,
  add column if not exists requested_national_role text;

commit;
