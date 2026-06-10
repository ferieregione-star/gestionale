
create extension if not exists "uuid-ossp";

create table if not exists sectors (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  first_name text not null,
  last_name text not null,
  matricola text unique not null,
  role text not null check (role in ('admin','employee','sector_manager','viewer')),
  sector_id uuid references sectors(id),
  c01 numeric default 0,
  c02 numeric default 0,
  approved boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists viewer_sectors (
  viewer_id uuid references profiles(id) on delete cascade,
  sector_id uuid references sectors(id) on delete cascade,
  primary key (viewer_id, sector_id)
);

create table if not exists leave_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade not null,
  sector_id uuid references sectors(id) on delete cascade not null,
  day date not null,
  type text not null check (type in ('smart','ferie','malattia','permesso','altro')),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, day)
);

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_role text,
  sector_id uuid references sectors(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists password_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  requested_password text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists vacation_plan_periods (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  type text not null check (type in ('summer','winter','easter','custom')),
  created_at timestamptz default now()
);

create table if not exists vacation_plan_entries (
  id uuid primary key default uuid_generate_v4(),
  period_id uuid references vacation_plan_periods(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  sector_id uuid references sectors(id) on delete cascade not null,
  starts_on date not null,
  ends_on date not null,
  note text,
  status text default 'draft' check (status in ('draft','submitted','reviewed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into sectors(name) values ('Prevenzione'),('Territorio'),('Veterinaria') on conflict do nothing;
insert into vacation_plan_periods(name, starts_on, ends_on, type) values
('Piano ferie estate','2026-06-01','2026-09-30','summer'),
('Piano ferie inverno','2026-12-01','2027-01-31','winter'),
('Piano ferie Pasqua','2026-03-30','2026-04-06','easter');

alter table sectors enable row level security;
alter table profiles enable row level security;
alter table viewer_sectors enable row level security;
alter table leave_events enable row level security;
alter table notifications enable row level security;
alter table password_requests enable row level security;
alter table vacation_plan_periods enable row level security;
alter table vacation_plan_entries enable row level security;

create or replace function public.my_role() returns text language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.my_sector() returns uuid language sql stable as $$
  select sector_id from profiles where id = auth.uid()
$$;

create or replace function public.can_view_sector(s uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and (
      p.role = 'admin'
      or p.sector_id = s
      or exists(select 1 from viewer_sectors vs where vs.viewer_id = auth.uid() and vs.sector_id = s)
    )
  )
$$;

create policy "sectors read" on sectors for select to authenticated using (true);
create policy "sectors admin write" on sectors for all to authenticated using (my_role()='admin') with check (my_role()='admin');

create policy "profiles read" on profiles for select to authenticated using (
  id = auth.uid() or my_role()='admin' or can_view_sector(sector_id)
);
create policy "profiles insert self" on profiles for insert to authenticated with check (id=auth.uid());
create policy "profiles update self" on profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "profiles update admin" on profiles for update to authenticated using (my_role()='admin');

create policy "viewer sectors read" on viewer_sectors for select to authenticated using (viewer_id=auth.uid() or my_role()='admin');
create policy "viewer sectors admin" on viewer_sectors for all to authenticated using (my_role()='admin') with check (my_role()='admin');

create policy "leave read sector" on leave_events for select to authenticated using (can_view_sector(sector_id));
create policy "leave insert" on leave_events for insert to authenticated with check (
  my_role()='admin' or (my_role()='sector_manager' and sector_id=my_sector()) or (my_role()='employee' and user_id=auth.uid())
);
create policy "leave update" on leave_events for update to authenticated using (
  my_role()='admin' or (my_role()='sector_manager' and sector_id=my_sector()) or (my_role()='employee' and user_id=auth.uid())
);
create policy "leave delete" on leave_events for delete to authenticated using (
  my_role()='admin' or (my_role()='sector_manager' and sector_id=my_sector()) or (my_role()='employee' and user_id=auth.uid())
);

create policy "notifications read" on notifications for select to authenticated using (
  user_id=auth.uid() or recipient_role=my_role() or (sector_id is not null and can_view_sector(sector_id) and my_role()<>'viewer')
);
create policy "notifications insert" on notifications for insert to authenticated with check (true);
create policy "notifications update" on notifications for update to authenticated using (user_id=auth.uid() or recipient_role=my_role() or my_role()='admin');

create policy "password requests insert" on password_requests for insert to authenticated with check (user_id=auth.uid());
create policy "password requests read" on password_requests for select to authenticated using (my_role()='admin' or user_id=auth.uid());
create policy "password requests update" on password_requests for update to authenticated using (my_role()='admin');

create policy "periods read" on vacation_plan_periods for select to authenticated using (true);
create policy "plan read" on vacation_plan_entries for select to authenticated using (can_view_sector(sector_id));
create policy "plan insert" on vacation_plan_entries for insert to authenticated with check (
  my_role()='admin' or (my_role()='sector_manager' and sector_id=my_sector()) or user_id=auth.uid()
);
create policy "plan update" on vacation_plan_entries for update to authenticated using (
  my_role()='admin' or (my_role()='sector_manager' and sector_id=my_sector()) or user_id=auth.uid()
);
