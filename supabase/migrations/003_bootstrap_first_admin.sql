-- RainDogs: seed the initial charters and bind the only Auth user
-- to the first application administrator profile.
-- Safety: aborts unless the project contains exactly one Auth user.

begin;

insert into public.charters (name)
values
  ('Ankara'),
  ('Denizli'),
  ('Eskişehir'),
  ('İstanbul/Kadıköy'),
  ('İzmir'),
  ('Sakarya/Hendek'),
  ('Uşak')
on conflict (name) do update set active = true;

insert into public.profiles (
    id,
    nick,
    full_name,
    member_level,
    account_status,
    charter_id,
    national_role,
    is_app_admin,
    approved_by,
    approved_at
  )
  select
    u.id,
    'Sexist Dog',
    'Işık Ayberk Cerit',
    'member',
    'active',
    c.id,
    'National Secretary',
    true,
    u.id,
    now()
  from auth.users u
  cross join public.charters c
  where c.name = 'Denizli'
    and (select count(*) from auth.users) = 1
  on conflict (id) do update set
    nick = excluded.nick,
    full_name = excluded.full_name,
    member_level = excluded.member_level,
    account_status = excluded.account_status,
    charter_id = excluded.charter_id,
    charter_role = null,
    national_role = excluded.national_role,
    is_app_admin = excluded.is_app_admin,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = now();

commit;

select
  p.nick,
  p.full_name,
  p.national_role,
  p.is_app_admin,
  p.account_status,
  c.name as charter
from public.profiles p
join public.charters c on c.id = p.charter_id
where p.nick = 'Sexist Dog';
