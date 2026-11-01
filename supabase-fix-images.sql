-- ONE-TIME FIX (safe to re-run). Run in Supabase -> SQL Editor.
-- Makes sure: photo bucket exists and is PUBLIC, multi-photo column exists,
-- and admins can add / edit / delete properties and photos.

-- 1) Photo bucket must be PUBLIC, otherwise photos never show on the website
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Multiple photos per property (image_url stays as the cover photo)
alter table public.properties add column if not exists image_urls text[] not null default '{}';
update public.properties set image_urls = array[image_url]
where image_url is not null and coalesce(array_length(image_urls,1),0) = 0;

-- 3) Admin permissions for properties (edit + delete)
grant select, insert, update, delete on public.properties to authenticated;
grant select on public.properties to anon;

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

-- 4) Admin permissions for photo files
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

-- CHECK: the bucket must show public = true
select id, public from storage.buckets where id = 'property-images';
-- CHECK: what photo address is saved for each property
select title, image_url from public.properties order by created_at desc;
