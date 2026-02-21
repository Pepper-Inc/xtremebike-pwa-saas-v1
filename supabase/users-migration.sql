-- ════════════════════════════════════════════════════════════════
-- XTREME BIKE — USER MANAGEMENT MIGRATION
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- 1. Add new columns to profiles
alter table public.profiles
  add column if not exists credits_remaining int not null default 0,
  add column if not exists is_active         boolean not null default true,
  add column if not exists phone             text,
  add column if not exists notes             text;

-- 2. Drop old restrictive update policy
drop policy if exists "profiles_update" on public.profiles;

-- 3. Users can update their own profile
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (auth.uid() = id);

-- 4. Admins can update ANY profile (needed for user management)
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 5. Admins can insert new profiles (for invite flow)
create policy "profiles_admin_insert" on public.profiles
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 6. Admins can delete profiles (soft-delete via is_active preferred)
create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Verify columns were added
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'profiles'
order by ordinal_position;
