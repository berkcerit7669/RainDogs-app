begin;

create table if not exists public.archive_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  storage_path text not null,
  min_member_level public.member_level not null default 'hangaround',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists archive_documents_created_idx on public.archive_documents(created_at desc);

alter table public.archive_documents enable row level security;
revoke all on public.archive_documents from anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('archive-docs','archive-docs',false,20971520,array['application/pdf'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

commit;
