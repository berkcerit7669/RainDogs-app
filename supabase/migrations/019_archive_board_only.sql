begin;

alter table public.archive_documents add column if not exists board_only boolean not null default false;

commit;
