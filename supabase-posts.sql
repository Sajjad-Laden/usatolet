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
