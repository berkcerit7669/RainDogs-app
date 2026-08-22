begin;

alter table public.profiles
  add column if not exists license_class text;

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, member_id)
);

create table if not exists public.event_responses (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('yes','maybe','no')),
  responded_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create table if not exists public.emergency_profiles (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  blood_group text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  medical_notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.charter_finance (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references public.charters(id) on delete cascade,
  entry_type text not null check (entry_type in ('Gelir','Gider','Aidat')),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.charter_discipline (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references public.charters(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  question text not null,
  options jsonb not null default '["Evet","Hayır","Çekimser"]'::jsonb,
  status text not null default 'Açık' check (status in ('Açık','Kapalı')),
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_poll_votes (
  poll_id uuid not null references public.board_polls(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  option_value text not null,
  voted_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);

create table if not exists public.help_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.help_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('national_content','joint_event')),
  content_kind text not null check (content_kind in ('event','announcement','route')),
  payload jsonb not null default '{}'::jsonb,
  source_charter_id uuid references public.charters(id) on delete cascade,
  target_charter_id uuid references public.charters(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('profile-photos','profile-photos',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('content-media','content-media',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('support-screenshots','support-screenshots',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.is_board_member(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id=uid and account_status='active'
      and (national_role is not null or charter_role='President' or is_app_admin)
  );
$$;

create or replace function public.has_charter_role(required_roles text[], target_charter uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id=uid and account_status='active' and charter_id=target_charter
      and charter_role=any(required_roles)
  );
$$;

alter table public.announcement_reads enable row level security;
alter table public.event_responses enable row level security;
alter table public.emergency_profiles enable row level security;
alter table public.charter_finance enable row level security;
alter table public.charter_discipline enable row level security;
alter table public.board_polls enable row level security;
alter table public.board_poll_votes enable row level security;
alter table public.help_ticket_messages enable row level security;
alter table public.approval_requests enable row level security;

drop policy if exists announcement_reads_self on public.announcement_reads;
create policy announcement_reads_self on public.announcement_reads for all
  using (member_id=auth.uid() or public.is_national())
  with check (member_id=auth.uid());

drop policy if exists event_responses_self on public.event_responses;
create policy event_responses_self on public.event_responses for all
  using (member_id=auth.uid() or public.is_national())
  with check (member_id=auth.uid());

drop policy if exists emergency_profiles_private on public.emergency_profiles;
create policy emergency_profiles_private on public.emergency_profiles for select
  using (
    member_id=auth.uid() or public.is_national() or
    public.is_charter_manager((select charter_id from public.profiles where id=member_id))
  );
drop policy if exists emergency_profiles_self_write on public.emergency_profiles;
create policy emergency_profiles_self_write on public.emergency_profiles for all
  using (member_id=auth.uid()) with check (member_id=auth.uid());

drop policy if exists charter_finance_management on public.charter_finance;
create policy charter_finance_management on public.charter_finance for all
  using (public.is_national() or public.has_charter_role(array['President','Vice President','Treasurer'],charter_id))
  with check (public.is_national() or public.has_charter_role(array['President','Vice President','Treasurer'],charter_id));

drop policy if exists charter_discipline_management on public.charter_discipline;
create policy charter_discipline_management on public.charter_discipline for all
  using (public.is_national() or public.has_charter_role(array['President','Vice President','Sgt. at Arms'],charter_id))
  with check (public.is_national() or public.has_charter_role(array['President','Vice President','Sgt. at Arms'],charter_id));

drop policy if exists board_polls_board_only on public.board_polls;
create policy board_polls_board_only on public.board_polls for select using (public.is_board_member());
drop policy if exists board_poll_votes_board_only on public.board_poll_votes;
create policy board_poll_votes_board_only on public.board_poll_votes for select using (public.is_board_member());
drop policy if exists board_poll_votes_self_write on public.board_poll_votes;
create policy board_poll_votes_self_write on public.board_poll_votes for all
  using (member_id=auth.uid()) with check (member_id=auth.uid() and public.is_board_member());

drop policy if exists help_ticket_messages_participants on public.help_ticket_messages;
create policy help_ticket_messages_participants on public.help_ticket_messages for select using (
  sender_id=auth.uid() or exists(
    select 1 from public.help_tickets t
    where t.id=ticket_id and (t.reporter_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_app_admin))
  )
);

drop policy if exists approval_requests_participants on public.approval_requests;
create policy approval_requests_participants on public.approval_requests for select using (
  submitted_by=auth.uid() or public.is_national() or
  public.is_charter_manager(source_charter_id) or public.is_charter_manager(target_charter_id)
);

-- Charter içerikleri doğrudan REST üzerinden de başka charter üyelerine sızmasın.
drop policy if exists events_member_read on public.events;
create policy events_member_read on public.events for select using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and
    (scope='national' or owner_charter_id=p.charter_id or p.national_role is not null or p.is_app_admin or
      (scope='joint' and exists(
        select 1 from public.event_charters ec
        where ec.event_id=events.id and ec.charter_id=p.charter_id and ec.approval_status='active'
      ))))
);
drop policy if exists announcements_member_read on public.announcements;
create policy announcements_member_read on public.announcements for select using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and
    (scope in ('national','joint') or charter_id=p.charter_id or p.national_role is not null or p.is_app_admin))
);
drop policy if exists routes_member_read on public.routes;
create policy routes_member_read on public.routes for select using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and
    (scope in ('national','joint') or charter_id=p.charter_id or p.national_role is not null or p.is_app_admin))
);

grant select,insert,update,delete on public.announcement_reads,public.event_responses,
  public.emergency_profiles,public.charter_finance,public.charter_discipline,
  public.board_polls,public.board_poll_votes,public.help_ticket_messages to authenticated;
grant select on public.approval_requests to authenticated;
grant all privileges on public.announcement_reads,public.event_responses,
  public.emergency_profiles,public.charter_finance,public.charter_discipline,
  public.board_polls,public.board_poll_votes,public.help_ticket_messages to service_role;
grant all privileges on public.approval_requests to service_role;

commit;
