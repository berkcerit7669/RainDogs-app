-- Members approved/created before role_history bookkeeping existed have a
-- charter_role and/or national_role on their profile but no corresponding
-- open role_history row, so "Görev Geçmişi" shows empty for them even
-- though they currently hold a role. Backfill one open row per currently
-- held role, using the best available start date.
insert into public.role_history (member_id, role_scope, role_name, started_at)
select id, 'charter', charter_role, coalesce(approved_at::date, created_at::date, current_date)
from public.profiles p
where charter_role is not null
  and not exists (
    select 1 from public.role_history rh
    where rh.member_id = p.id and rh.role_scope = 'charter' and rh.ended_at is null
  );

insert into public.role_history (member_id, role_scope, role_name, started_at)
select id, 'national', national_role, coalesce(approved_at::date, created_at::date, current_date)
from public.profiles p
where national_role is not null
  and not exists (
    select 1 from public.role_history rh
    where rh.member_id = p.id and rh.role_scope = 'national' and rh.ended_at is null
  );
