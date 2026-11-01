-- USA Real Estate: run this in Supabase SQL Editor.
-- Public users can submit leads and view active properties only.
-- Only authenticated users listed in admin_users can read leads or manage properties.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price numeric(14,2) not null check (price >= 0),
  listing_type text not null check (listing_type in ('rent','sale')),
  address text,
  city text,
  state text,
  zip_code text,
  beds integer not null default 0 check (beds >= 0),
  baths numeric(4,1) not null default 0 check (baths >= 0),
  sqft integer check (sqft is null or sqft >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text not null check (char_length(phone) between 5 and 30),
  email text not null check (char_length(email) between 5 and 254),
  interest text not null check (interest in ('rent','buy','both')),
  preferred_location text,
  message text,
  contact_consent boolean not null default false check (contact_consent = true),
  marketing_consent boolean not null default false,
  source text not null default 'website',
  status text not null default 'new' check (status in ('new','contacted','qualified','closed')),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.properties enable row level security;
alter table public.leads enable row level security;

-- Admin can only see their own allow-list row. No client-side insert/update/delete policy.
drop policy if exists "Admins can read own admin row" on public.admin_users;
create policy "Admins can read own admin row" on public.admin_users
for select to authenticated using (user_id = (select auth.uid()));

-- Public can see active listings; admins can see/manage all listings.
drop policy if exists "Anyone can view active properties" on public.properties;
create policy "Anyone can view active properties" on public.properties
for select to anon, authenticated using (
  is_active = true or exists (
    select 1 from public.admin_users au where au.user_id = (select auth.uid())
  )
);
drop policy if exists "Admins insert properties" on public.properties;
create policy "Admins insert properties" on public.properties
for insert to authenticated with check (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins update properties" on public.properties;
create policy "Admins update properties" on public.properties
for update to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins delete properties" on public.properties;
create policy "Admins delete properties" on public.properties
for delete to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

-- Anyone can submit an inquiry. No public read/update/delete policy.
drop policy if exists "Visitors can submit leads" on public.leads;
create policy "Visitors can submit leads" on public.leads
for insert to anon, authenticated with check (
  contact_consent = true
  and status = 'new'
  and source = 'website'
  and char_length(full_name) between 1 and 120
  and char_length(phone) between 5 and 30
  and char_length(email) between 5 and 254
);
drop policy if exists "Admins can read leads" on public.leads;
create policy "Admins can read leads" on public.leads
for select to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins can update leads" on public.leads;
create policy "Admins can update leads" on public.leads
for update to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

grant usage on schema public to anon, authenticated;
-- Supabase grants ALL privileges on new public tables to anon/authenticated by default.
-- Reset to least privilege first, then grant only what the site needs.
revoke all on public.admin_users, public.properties, public.leads from anon, authenticated;
grant select on public.properties to anon, authenticated;
grant insert on public.leads to anon, authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant select, update on public.leads to authenticated;
-- Needed so the property SELECT policy can evaluate its admin-membership subquery.
-- RLS still returns no admin_users rows to anon visitors.
grant select on public.admin_users to anon, authenticated;

-- ============================================================================
-- v2 upgrade (safe to re-run): optional email, property link on leads,
-- property type, and photo storage. Already applied to the live project.
-- ============================================================================

-- Email is optional on leads
alter table public.leads alter column email drop not null;
alter table public.leads drop constraint if exists leads_email_check;
alter table public.leads add constraint leads_email_check
  check (email is null or char_length(email) between 5 and 254);

-- Which property the visitor asked about
alter table public.leads
  add column if not exists property_id uuid references public.properties(id) on delete set null;
create index if not exists leads_property_id_idx on public.leads (property_id);

-- Property type (House / Apartment / ...)
alter table public.properties add column if not exists property_type text not null default 'house';
alter table public.properties drop constraint if exists properties_property_type_check;
alter table public.properties add constraint properties_property_type_check
  check (property_type in ('house','apartment','condo','townhouse','room','other'));

-- Lead insert policy: same rules, but email may be empty
drop policy if exists "Visitors can submit leads" on public.leads;
create policy "Visitors can submit leads" on public.leads
for insert to anon, authenticated with check (
  contact_consent = true
  and status = 'new'
  and source = 'website'
  and char_length(full_name) between 1 and 120
  and char_length(phone) between 5 and 30
  and (email is null or char_length(email) between 5 and 254)
);

-- Property photos: anyone can view a photo by its URL, only admins can upload/change/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload property images" on storage.objects;
create policy "Admins upload property images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'property-images'
  and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins read property images" on storage.objects;
create policy "Admins read property images" on storage.objects
for select to authenticated using (
  bucket_id = 'property-images'
  and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins update property images" on storage.objects;
create policy "Admins update property images" on storage.objects
for update to authenticated using (
  bucket_id = 'property-images'
  and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
) with check (
  bucket_id = 'property-images'
  and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
drop policy if exists "Admins delete property images" on storage.objects;
create policy "Admins delete property images" on storage.objects
for delete to authenticated using (
  bucket_id = 'property-images'
  and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

notify pgrst, 'reload schema';

-- IMPORTANT: Create the Auth user in Supabase Dashboard first.
-- Then replace USER_AUTH_UUID below with that user's real UUID and run:
-- insert into public.admin_users (user_id) values ('USER_AUTH_UUID');

-- ============================================================================
-- v3 upgrade (safe to re-run): multiple photos per property
-- ============================================================================
alter table public.properties add column if not exists image_urls text[] not null default '{}';
update public.properties set image_urls = array[image_url]
where image_url is not null and coalesce(array_length(image_urls,1),0) = 0;
notify pgrst, 'reload schema';

-- ============================================================================
-- v6 upgrade: team accounts + lead attribution (same as supabase-team.sql)
-- ============================================================================
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

-- ============================================================================
-- v7 upgrade: employee posts + rental details (same as supabase-posts.sql)
-- ============================================================================
-- POSTS FEATURE (safe to re-run). Run once in Supabase -> SQL Editor.
-- Employees can post / edit / delete their OWN properties, new rental details,
-- and leads from a post are credited to the employee who posted it.

-- 1) New columns on properties
alter table public.properties
  add column if not exists posted_by uuid references auth.users(id) on delete set null,
  add column if not exists owner_ref text,
  add column if not exists laundry_type text,
  add column if not exists parking_type text,
  add column if not exists ac_type text,
  add column if not exists heating_type text,
  add column if not exists cat_friendly boolean not null default false,
  add column if not exists dog_friendly boolean not null default false,
  add column if not exists voucher_accepted boolean not null default false;

create index if not exists properties_posted_by_idx on public.properties (posted_by);

alter table public.properties drop constraint if exists properties_laundry_type_check;
alter table public.properties add constraint properties_laundry_type_check
  check (laundry_type is null or laundry_type in ('in_unit','in_building','available','none'));
alter table public.properties drop constraint if exists properties_parking_type_check;
alter table public.properties add constraint properties_parking_type_check
  check (parking_type is null or parking_type in ('garage','street','off_street','available','none'));
alter table public.properties drop constraint if exists properties_ac_type_check;
alter table public.properties add constraint properties_ac_type_check
  check (ac_type is null or ac_type in ('central','available','none'));
alter table public.properties drop constraint if exists properties_heating_type_check;
alter table public.properties add constraint properties_heating_type_check
  check (heating_type is null or heating_type in ('central','electric','gas','radiator','available','none'));

-- 2) Who can see / change properties
-- Public sees active listings; an employee also sees their own hidden posts; admins see all.
drop policy if exists "Anyone can view active properties" on public.properties;
create policy "Anyone can view active properties" on public.properties
for select to anon, authenticated using (
  is_active = true
  or posted_by = (select auth.uid())
  or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

drop policy if exists "Staff insert own properties" on public.properties;
create policy "Staff insert own properties" on public.properties
for insert to authenticated with check (
  posted_by = (select auth.uid())
  and exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.is_active and s.ref_code = properties.owner_ref
  )
);
drop policy if exists "Staff update own properties" on public.properties;
create policy "Staff update own properties" on public.properties
for update to authenticated using (
  posted_by = (select auth.uid())
  and exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.is_active)
) with check (
  posted_by = (select auth.uid())
  and exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.is_active and s.ref_code = properties.owner_ref
  )
);
drop policy if exists "Staff delete own properties" on public.properties;
create policy "Staff delete own properties" on public.properties
for delete to authenticated using (
  posted_by = (select auth.uid())
  and exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.is_active)
);

grant select, insert, update, delete on public.properties to authenticated;

-- 3) Photo files: employees can upload, and read/delete only the files THEY uploaded
drop policy if exists "Staff upload property images" on storage.objects;
create policy "Staff upload property images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'property-images'
  and exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.is_active)
);

do $$
begin
  begin
    execute $p$drop policy if exists "Staff read own property images" on storage.objects$p$;
    execute $p$create policy "Staff read own property images" on storage.objects
      for select to authenticated using (bucket_id = 'property-images' and owner_id = (select auth.uid())::text)$p$;
    execute $p$drop policy if exists "Staff delete own property images" on storage.objects$p$;
    execute $p$create policy "Staff delete own property images" on storage.objects
      for delete to authenticated using (bucket_id = 'property-images' and owner_id = (select auth.uid())::text)$p$;
  exception when others then
    -- older Supabase projects use the "owner" column instead of "owner_id"
    execute $p$drop policy if exists "Staff read own property images" on storage.objects$p$;
    execute $p$create policy "Staff read own property images" on storage.objects
      for select to authenticated using (bucket_id = 'property-images' and owner = (select auth.uid()))$p$;
    execute $p$drop policy if exists "Staff delete own property images" on storage.objects$p$;
    execute $p$create policy "Staff delete own property images" on storage.objects
      for delete to authenticated using (bucket_id = 'property-images' and owner = (select auth.uid()))$p$;
  end;
end $$;

notify pgrst, 'reload schema';
