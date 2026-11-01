-- TEAM FEATURE (safe to re-run). Run once in Supabase -> SQL Editor.
-- Employee accounts, per-employee tracking codes, and lead attribution.

-- 1) Employee table (one row per employee login)
create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text,
  ref_code text not null unique check (ref_code ~ '^[a-z0-9_-]{3,32}$'),
  segment text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

drop policy if exists "Staff read own row, admins read all" on public.staff;
create policy "Staff read own row, admins read all" on public.staff
for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins insert staff" on public.staff;
create policy "Admins insert staff" on public.staff
for insert to authenticated with check (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins update staff" on public.staff;
create policy "Admins update staff" on public.staff
for update to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins delete staff" on public.staff;
create policy "Admins delete staff" on public.staff
for delete to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

revoke all on public.staff from anon, authenticated;
grant select, insert, update, delete on public.staff to authenticated;

-- 2) Which employee's link a lead came from
alter table public.leads add column if not exists ref_code text;
alter table public.leads drop constraint if exists leads_ref_code_check;
alter table public.leads add constraint leads_ref_code_check
  check (ref_code is null or ref_code ~ '^[a-z0-9_-]{3,32}$');
create index if not exists leads_ref_code_idx on public.leads (ref_code, created_at);

-- 3) Visitors can still submit leads (now with optional ref_code)
drop policy if exists "Visitors can submit leads" on public.leads;
create policy "Visitors can submit leads" on public.leads
for insert to anon, authenticated with check (
  contact_consent = true
  and status = 'new'
  and source = 'website'
  and char_length(full_name) between 1 and 120
  and char_length(phone) between 5 and 30
  and (email is null or char_length(email) between 5 and 254)
  and (ref_code is null or ref_code ~ '^[a-z0-9_-]{3,32}$')
);

-- 4) An employee can read ONLY the leads that came through their own code
drop policy if exists "Staff can read own leads" on public.leads;
create policy "Staff can read own leads" on public.leads
for select to authenticated using (
  ref_code is not null
  and exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.is_active and s.ref_code = leads.ref_code
  )
);

notify pgrst, 'reload schema';
