-- RainDogs production data model (Supabase / PostgreSQL)
-- Run in a new Supabase project before connecting the web client.

create extension if not exists pgcrypto;

create type public.member_level as enum ('hangaround','prospect','member');
create type public.record_status as enum ('pending','active','frozen','left','rejected','archived');
create type public.content_scope as enum ('national','charter','joint');
create type public.attendance_status as enum ('waiting','attended','absent','excused');

create table public.charters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null unique,
  full_name text not null unique,
  phone text,
  motorcycle text,
  avatar_path text,
  member_level public.member_level not null default 'hangaround',
  account_status public.record_status not null default 'pending',
  charter_id uuid references public.charters(id),
  charter_role text,
  national_role text,
  is_app_admin boolean not null default false,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_president_per_charter on public.profiles(charter_id)
  where charter_role = 'President' and account_status = 'active';
create unique index one_person_per_national_role on public.profiles(national_role)
  where national_role is not null and account_status = 'active';

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  scope public.content_scope not null,
  owner_charter_id uuid references public.charters(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  route_text text,
  distance_km integer check (distance_km is null or distance_km >= 0),
  importance text not null default 'Normal',
  participation_status text not null default 'Açık',
  status public.record_status not null default 'active',
  poster_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_charters (
  event_id uuid references public.events(id) on delete cascade,
  charter_id uuid references public.charters(id) on delete cascade,
  approval_status public.record_status not null default 'pending',
  primary key (event_id, charter_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  scope public.content_scope not null,
  charter_id uuid references public.charters(id),
  importance text not null default 'Normal',
  required_read boolean not null default false,
  status public.record_status not null default 'active',
  photo_path text,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope public.content_scope not null,
  charter_id uuid references public.charters(id),
  distance_km integer not null check (distance_km >= 0),
  difficulty text not null,
  duration text,
  surface text,
  character text,
  notes text,
  photo_path text,
  status public.record_status not null default 'active',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance (
  event_id uuid references public.events(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade,
  status public.attendance_status not null default 'waiting',
  finalized boolean not null default false,
  marked_by uuid references public.profiles(id),
  marked_at timestamptz,
  km_credited integer not null default 0,
  primary key (event_id, member_id)
);

create table public.km_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id),
  event_id uuid references public.events(id),
  route_name text not null,
  km integer not null check (km > 0),
  status public.record_status not null default 'pending',
  submitted_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create table public.clubhouse_visits (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references public.charters(id),
  member_id uuid not null references public.profiles(id),
  guest_count integer not null default 0 check (guest_count >= 0),
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  closed_by uuid references public.profiles(id)
);

create unique index one_open_visit_per_member on public.clubhouse_visits(member_id)
  where exited_at is null;

create table public.member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id),
  charter_id uuid not null references public.charters(id),
  note_type text not null,
  body text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  action_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.help_tickets (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  subject text not null,
  body text not null,
  screenshot_path text,
  status text not null default 'Yeni',
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_national(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=uid and account_status='active' and (national_role is not null or is_app_admin));
$$;

create or replace function public.is_charter_manager(cid uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=uid and account_status='active' and charter_id=cid and charter_role in ('President','Vice President','Sgt. at Arms','Secretary','Treasurer','Road Captain','Tail Gunner'));
$$;

alter table public.profiles enable row level security;
alter table public.charters enable row level security;
alter table public.events enable row level security;
alter table public.event_charters enable row level security;
alter table public.announcements enable row level security;
alter table public.routes enable row level security;
alter table public.attendance enable row level security;
alter table public.km_entries enable row level security;
alter table public.clubhouse_visits enable row level security;
alter table public.member_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.help_tickets enable row level security;
alter table public.admin_logs enable row level security;

create policy profiles_self_read on public.profiles for select using (id=auth.uid());
create policy profiles_management_read on public.profiles for select using (public.is_national() or public.is_charter_manager(charter_id));
create policy charters_member_read on public.charters for select using ((select account_status='active' from public.profiles where id=auth.uid()));
create policy charters_national_write on public.charters for all using (public.is_national()) with check (public.is_national());
create policy events_member_read on public.events for select using ((select account_status='active' from public.profiles where id=auth.uid()));
create policy events_management_write on public.events for all using (public.is_national() or public.is_charter_manager(owner_charter_id)) with check (public.is_national() or public.is_charter_manager(owner_charter_id));
create policy event_charters_member_read on public.event_charters for select using ((select account_status='active' from public.profiles where id=auth.uid()));
create policy event_charters_management_write on public.event_charters for all using (public.is_national() or public.is_charter_manager(charter_id)) with check (public.is_national() or public.is_charter_manager(charter_id));
create policy announcements_member_read on public.announcements for select using ((select account_status='active' from public.profiles where id=auth.uid()));
create policy announcements_management_write on public.announcements for all using (public.is_national() or public.is_charter_manager(charter_id)) with check (public.is_national() or public.is_charter_manager(charter_id));
create policy routes_member_read on public.routes for select using ((select account_status='active' from public.profiles where id=auth.uid()));
create policy routes_management_write on public.routes for all using (public.is_national() or public.is_charter_manager(charter_id)) with check (public.is_national() or public.is_charter_manager(charter_id));
create policy attendance_self_read on public.attendance for select using (member_id=auth.uid() or public.is_national() or public.is_charter_manager((select owner_charter_id from public.events where id=event_id)));
create policy attendance_management_write on public.attendance for all using (public.is_national() or public.is_charter_manager((select owner_charter_id from public.events where id=event_id))) with check (public.is_national() or public.is_charter_manager((select owner_charter_id from public.events where id=event_id)));
create policy km_self_read on public.km_entries for select using (member_id=auth.uid() or public.is_national());
create policy visits_charter_read on public.clubhouse_visits for select using (member_id=auth.uid() or public.is_national() or public.is_charter_manager(charter_id));
create policy visits_self_insert on public.clubhouse_visits for insert with check (member_id=auth.uid() and charter_id=(select charter_id from public.profiles where id=auth.uid()));
create policy visits_self_update on public.clubhouse_visits for update using (member_id=auth.uid() or public.is_national() or public.is_charter_manager(charter_id));
create policy notes_management_only on public.member_notes for all using (public.is_national() or public.is_charter_manager(charter_id)) with check (public.is_national() or public.is_charter_manager(charter_id));
create policy notifications_self on public.notifications for select using (recipient_id=auth.uid());
create policy notifications_self_update on public.notifications for update using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
create policy tickets_self_read on public.help_tickets for select using (reporter_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and is_app_admin));
create policy tickets_self_insert on public.help_tickets for insert with check (reporter_id=auth.uid());
create policy tickets_admin_update on public.help_tickets for update using (exists(select 1 from public.profiles where id=auth.uid() and is_app_admin)) with check (exists(select 1 from public.profiles where id=auth.uid() and is_app_admin));
create policy logs_national_read on public.admin_logs for select using (public.is_national());

-- Attendance kilometre is server-owned and idempotent.
create or replace function public.finalize_event_attendance(p_event_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_event public.events; v_count integer;
begin
  select * into v_event from public.events where id=p_event_id for update;
  if not (public.is_national() or public.is_charter_manager(v_event.owner_charter_id)) then raise exception 'forbidden'; end if;
  if coalesce(v_event.distance_km,0)=0 then raise exception 'distance_required'; end if;
  update public.attendance set finalized=true, marked_by=auth.uid(), marked_at=now() where event_id=p_event_id;
  insert into public.km_entries(member_id,event_id,route_name,km,status,submitted_by,approved_by)
    select member_id,p_event_id,v_event.title,v_event.distance_km,'active',auth.uid(),auth.uid()
    from public.attendance where event_id=p_event_id and status='attended'
    on conflict(event_id,member_id) do nothing;
  update public.attendance set km_credited=v_event.distance_km where event_id=p_event_id and status='attended' and km_credited=0;
  get diagnostics v_count=row_count; return v_count;
end $$;

revoke all on function public.finalize_event_attendance(uuid) from public;
grant execute on function public.finalize_event_attendance(uuid) to authenticated;
