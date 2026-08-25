begin;

alter table public.profiles add column if not exists birthday date;

commit;
