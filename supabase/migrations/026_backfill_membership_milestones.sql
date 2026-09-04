-- membership_milestones (used for the "New Blood" badge and vest-log
-- display) was only ever written by an admin manually filling in the
-- "Yelek Günlüğü" date, or (as of the previous fix) by the approval/
-- member-create flows going forward. Members approved before that had
-- no milestone row at all, so "New Blood" never appeared for them even
-- when genuinely new. Backfill one row per active member's current
-- level using their approval/creation date as the best available guess.
insert into public.membership_milestones (member_id, milestone, occurred_on)
select id, member_level::text, coalesce(approved_at::date, created_at::date, current_date)
from public.profiles p
where account_status = 'active'
  and member_level::text in ('hangaround','prospect','member')
  and not exists (
    select 1 from public.membership_milestones mm
    where mm.member_id = p.id and mm.milestone = p.member_level::text
  );
