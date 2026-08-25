begin;

insert into public.archive_documents (title, description, storage_path, min_member_level, board_only, created_by)
select
  'Rozet Rehberi',
  'Uygulamadaki tüm rozetlerin nasıl kazanıldığını açıklayan resmi rehber.',
  'system/rozet-rehberi.pdf',
  'hangaround',
  false,
  p.id
from public.profiles p
where p.is_app_admin = true
  and not exists (select 1 from public.archive_documents where storage_path = 'system/rozet-rehberi.pdf')
order by p.created_at asc
limit 1;

commit;
