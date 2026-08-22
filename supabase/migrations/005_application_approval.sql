-- Server-side membership application approval support.
-- Existing requested_* columns are introduced in migration 004.

create index if not exists profiles_pending_charter_idx
  on public.profiles (charter_id, created_at)
  where account_status = 'pending';

create or replace function public.can_review_membership(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid and account_status = 'active' and (
      is_app_admin
      or national_role in ('Amir','NVP','National Sgt. at Arms','National Secretary')
      or charter_role = 'Sgt. at Arms'
    )
  );
$$;

revoke all on function public.can_review_membership(uuid) from public;
grant execute on function public.can_review_membership(uuid) to authenticated;
