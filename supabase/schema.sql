-- ════════════════════════════════════════════════════════════════
-- XTREME BIKE MANAGEMENT — SUPABASE SCHEMA
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- ── EXTENSIONS ───────────────────────────────────────────────
-- (uuid-ossp is enabled by default in Supabase)

-- ── 1. PROFILES ──────────────────────────────────────────────
-- Extends auth.users with app-specific fields
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        text not null default 'instructor'
                check (role in ('admin', 'instructor')),
  gym_name    text default 'Xtreme Bike Studio',
  avatar_url  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'instructor')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. CLASSES ───────────────────────────────────────────────
create table if not exists public.classes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  instructor_name text not null,
  instructor_id   uuid references public.profiles(id) on delete set null,
  scheduled_at    timestamptz not null,
  capacity        int not null default 20,
  status          text not null default 'upcoming'
                    check (status in ('upcoming', 'active', 'done', 'cancelled')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── 3. BIKES ─────────────────────────────────────────────────
create table if not exists public.bikes (
  id                  int primary key,   -- bike number 1–20
  status              text not null default 'available'
                        check (status in ('available', 'occupied', 'blocked')),
  current_class_id    uuid references public.classes(id) on delete set null,
  current_user_name   text,
  credits_remaining   int,
  updated_at          timestamptz default now(),
  updated_by          uuid references public.profiles(id) on delete set null
);

-- Seed 20 bikes
insert into public.bikes (id, status)
select generate_series(1, 20), 'available'
on conflict (id) do nothing;

-- ── 4. RESERVATIONS ──────────────────────────────────────────
create table if not exists public.reservations (
  id                uuid primary key default gen_random_uuid(),
  bike_id           int not null references public.bikes(id),
  class_id          uuid references public.classes(id) on delete set null,
  user_name         text not null,
  credits_used      int not null default 1,
  credits_remaining int not null default 0,
  created_at        timestamptz default now(),
  created_by        uuid references public.profiles(id) on delete set null
);

-- ── 5. ATTENDANCES ───────────────────────────────────────────
create table if not exists public.attendances (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references public.classes(id) on delete cascade,
  user_name         text not null,
  bike_number       int,
  credits_remaining int not null default 0,
  status            text not null default 'pending'
                      check (status in ('pending', 'attended', 'noshow')),
  updated_at        timestamptz default now(),
  updated_by        uuid references public.profiles(id) on delete set null
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.classes     enable row level security;
alter table public.bikes       enable row level security;
alter table public.reservations enable row level security;
alter table public.attendances  enable row level security;

-- Profiles: users can read all, update only their own
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);

-- Classes: any authenticated user can read; admins can mutate
create policy "classes_select"  on public.classes  for select  to authenticated using (true);
create policy "classes_insert"  on public.classes  for insert  to authenticated with check (true);
create policy "classes_update"  on public.classes  for update  to authenticated using (true);
create policy "classes_delete"  on public.classes  for delete  to authenticated using (true);

-- Bikes: any authenticated user can read & update
create policy "bikes_select"  on public.bikes for select  to authenticated using (true);
create policy "bikes_update"  on public.bikes for update  to authenticated using (true);

-- Reservations: any authenticated user can read & create
create policy "reservations_select" on public.reservations for select to authenticated using (true);
create policy "reservations_insert" on public.reservations for insert to authenticated with check (true);
create policy "reservations_update" on public.reservations for update to authenticated using (true);

-- Attendances: any authenticated user can manage
create policy "attendances_select" on public.attendances for select to authenticated using (true);
create policy "attendances_insert" on public.attendances for insert to authenticated with check (true);
create policy "attendances_update" on public.attendances for update to authenticated using (true);
create policy "attendances_delete" on public.attendances for delete to authenticated using (true);

-- ── REALTIME ──────────────────────────────────────────────────
-- Enable realtime for live room map sync
alter publication supabase_realtime add table public.bikes;
alter publication supabase_realtime add table public.attendances;

-- ════════════════════════════════════════════════════════════════
-- SEED DATA — Run AFTER creating your first admin user
-- ════════════════════════════════════════════════════════════════

-- Promote first user to admin (run once after signup):
-- UPDATE public.profiles SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);

-- ── FIX: Delete any wrong-timezone classes and re-insert correctly
-- Uses 'America/Caracas' (UTC-4). Adjust if your gym is in a different TZ.
DELETE FROM public.classes WHERE scheduled_at::date != (now() AT TIME ZONE 'America/Caracas')::date;

insert into public.classes (name, instructor_name, scheduled_at, status, capacity)
values
  ('Spinning Intenso', 'Karla',
    (date_trunc('day', now() AT TIME ZONE 'America/Caracas') + interval '7 hours') AT TIME ZONE 'America/Caracas',
    'done', 20),
  ('Endurance Ride', 'Marco',
    (date_trunc('day', now() AT TIME ZONE 'America/Caracas') + interval '9 hours') AT TIME ZONE 'America/Caracas',
    'done', 20),
  ('Beats & Burn', 'Sofia',
    (date_trunc('day', now() AT TIME ZONE 'America/Caracas') + interval '11 hours') AT TIME ZONE 'America/Caracas',
    'done', 20),
  ('Power Hour', 'Diego',
    (date_trunc('day', now() AT TIME ZONE 'America/Caracas') + interval '18 hours') AT TIME ZONE 'America/Caracas',
    'active', 20),
  ('Night Ride', 'Ana',
    (date_trunc('day', now() AT TIME ZONE 'America/Caracas') + interval '20 hours') AT TIME ZONE 'America/Caracas',
    'upcoming', 20);
