begin;

-- Deleting a profile currently fails with a foreign key violation on almost
-- any account that has ever created content, logged an admin action, filed
-- a support ticket, etc. — none of these attribution columns had an ON
-- DELETE behavior defined, so Postgres defaulted to blocking the delete.
-- This makes admin.deleteAccount actually work: rows that only make sense
-- tied to a real person (their own km entries, clubhouse visits, notes
-- about them, tickets, admin log entries, a stray deletion-request record)
-- cascade away with them; rows that should keep existing regardless of who
-- authored them (events, announcements, routes, finance/discipline records,
-- board polls, archive docs, culture items) keep the row and just lose the
-- "created by" attribution.

alter table public.profiles drop constraint if exists profiles_approved_by_fkey;
alter table public.profiles add constraint profiles_approved_by_fkey foreign key (approved_by) references public.profiles(id) on delete set null;

alter table public.events alter column created_by drop not null;
alter table public.events drop constraint if exists events_created_by_fkey;
alter table public.events add constraint events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.announcements alter column created_by drop not null;
alter table public.announcements drop constraint if exists announcements_created_by_fkey;
alter table public.announcements add constraint announcements_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.routes alter column created_by drop not null;
alter table public.routes drop constraint if exists routes_created_by_fkey;
alter table public.routes add constraint routes_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.attendance drop constraint if exists attendance_marked_by_fkey;
alter table public.attendance add constraint attendance_marked_by_fkey foreign key (marked_by) references public.profiles(id) on delete set null;

alter table public.km_entries drop constraint if exists km_entries_member_id_fkey;
alter table public.km_entries add constraint km_entries_member_id_fkey foreign key (member_id) references public.profiles(id) on delete cascade;
alter table public.km_entries drop constraint if exists km_entries_submitted_by_fkey;
alter table public.km_entries add constraint km_entries_submitted_by_fkey foreign key (submitted_by) references public.profiles(id) on delete set null;
alter table public.km_entries drop constraint if exists km_entries_approved_by_fkey;
alter table public.km_entries add constraint km_entries_approved_by_fkey foreign key (approved_by) references public.profiles(id) on delete set null;

alter table public.clubhouse_visits drop constraint if exists clubhouse_visits_member_id_fkey;
alter table public.clubhouse_visits add constraint clubhouse_visits_member_id_fkey foreign key (member_id) references public.profiles(id) on delete cascade;
alter table public.clubhouse_visits drop constraint if exists clubhouse_visits_closed_by_fkey;
alter table public.clubhouse_visits add constraint clubhouse_visits_closed_by_fkey foreign key (closed_by) references public.profiles(id) on delete set null;

alter table public.member_notes drop constraint if exists member_notes_member_id_fkey;
alter table public.member_notes add constraint member_notes_member_id_fkey foreign key (member_id) references public.profiles(id) on delete cascade;
alter table public.member_notes alter column created_by drop not null;
alter table public.member_notes drop constraint if exists member_notes_created_by_fkey;
alter table public.member_notes add constraint member_notes_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.help_tickets drop constraint if exists help_tickets_reporter_id_fkey;
alter table public.help_tickets add constraint help_tickets_reporter_id_fkey foreign key (reporter_id) references public.profiles(id) on delete cascade;

alter table public.admin_logs drop constraint if exists admin_logs_actor_id_fkey;
alter table public.admin_logs add constraint admin_logs_actor_id_fkey foreign key (actor_id) references public.profiles(id) on delete cascade;

alter table public.clubhouse_states drop constraint if exists clubhouse_states_updated_by_fkey;
alter table public.clubhouse_states add constraint clubhouse_states_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.charter_finance alter column created_by drop not null;
alter table public.charter_finance drop constraint if exists charter_finance_created_by_fkey;
alter table public.charter_finance add constraint charter_finance_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.charter_discipline alter column created_by drop not null;
alter table public.charter_discipline drop constraint if exists charter_discipline_created_by_fkey;
alter table public.charter_discipline add constraint charter_discipline_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.board_polls alter column created_by drop not null;
alter table public.board_polls drop constraint if exists board_polls_created_by_fkey;
alter table public.board_polls add constraint board_polls_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.approval_requests drop constraint if exists approval_requests_decided_by_fkey;
alter table public.approval_requests add constraint approval_requests_decided_by_fkey foreign key (decided_by) references public.profiles(id) on delete set null;

alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_member_id_fkey;
alter table public.account_deletion_requests add constraint account_deletion_requests_member_id_fkey foreign key (member_id) references public.profiles(id) on delete cascade;

alter table public.archive_documents alter column created_by drop not null;
alter table public.archive_documents drop constraint if exists archive_documents_created_by_fkey;
alter table public.archive_documents add constraint archive_documents_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.culture_items drop constraint if exists culture_items_created_by_fkey;
alter table public.culture_items add constraint culture_items_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.membership_milestones drop constraint if exists membership_milestones_recorded_by_fkey;
alter table public.membership_milestones add constraint membership_milestones_recorded_by_fkey foreign key (recorded_by) references public.profiles(id) on delete set null;

alter table public.member_badges drop constraint if exists member_badges_awarded_by_fkey;
alter table public.member_badges add constraint member_badges_awarded_by_fkey foreign key (awarded_by) references public.profiles(id) on delete set null;

commit;
