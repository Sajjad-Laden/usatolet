-- STEP 2 (run AFTER supabase-schema.sql and AFTER creating the admin user in
-- Supabase Dashboard -> Authentication -> Users -> Add user).
--
-- Replace YOUR_ADMIN_EMAIL with the exact email you used for that Auth user,
-- then run this in the Supabase SQL Editor. No UUID copying needed.

insert into public.admin_users (user_id)
select id from auth.users
where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do nothing;

-- Check: this should return exactly 1 row.
select au.user_id, u.email
from public.admin_users au
join auth.users u on u.id = au.user_id;
