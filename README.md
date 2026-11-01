# USA Real Estate — website

Responsive English real-estate lead-generation site with Supabase storage and a protected admin dashboard.

## Folder layout (keep exactly like this)
```
index.html  property.html  admin.html  staff.html  privacy.html
styles.css  features.css   admin.css
js/  config.js  ref.js  property-form.js  property-options.js  app.js  property.js  admin.js  staff.js  export.js  xlsx-lite.js
supabase-schema.sql  supabase-fix-images.sql  supabase-team.sql  supabase-posts.sql  supabase-make-admin.sql  supabase-sample-properties.sql
```

## Features
- Home page: search, property cards with photo slider. Click a card to open that property's own page.
- `property.html?id=<id>`: all photos, price, address, bed/bath/type/size, description, full details list, map link and an inquiry form. The inquiry is saved with that property.
- Admin → Properties: add a property with unlimited photos; **Edit** any property (change info, add/remove photos, choose the cover photo); **Deactivate/Activate**; **Delete**. Hidden properties stay in the list.
- Admin → Customer leads: lead list, status updates, "Download Excel".
- **Team (admin → Team tab):** create employee logins. Each employee gets a tracking code. Links with `?ref=code` credit every inquiry to that employee. Admin sees leads today / last 7 days / total per employee and a day-by-day table by employee. Leads tab can be filtered by employee; Excel "Id name" column = employee.
- **Manage rental (`staff.html`):** employees sign in and post / edit / hide / delete their OWN properties with the same form as admin (plus laundry, parking, AC, heating, cat/dog friendly, housing voucher). They see only their own posts, leads and daily counts. Leads from a post are credited to the employee who posted it; admin sees every post and who posted it.
- "Copy link" gives the property page link to paste in Facebook posts etc.

## Setup
1. Supabase SQL Editor: run `supabase-schema.sql`, then **`supabase-fix-images.sql`** (makes the photo bucket public, adds multi-photo support, edit/delete permissions). Safe to re-run.
1b. Run **`supabase-team.sql`** (employee accounts + lead tracking).
1c. Run **`supabase-posts.sql`** (employee posts + rental details).
2. In Supabase → Authentication → Sign In / Providers → Email: turn **off** "Confirm email" so new employee accounts work immediately.
3. `js/config.js` has the project URL and **publishable** key. Never put a `service_role`/secret key in browser code.
3. Supabase → Authentication → Users: create the admin user (strong password, MFA if possible).
4. Run `supabase-make-admin.sql` (replace `YOUR_ADMIN_EMAIL`). It must return exactly 1 row.
5. Optional: `supabase-sample-properties.sql` for 3 test listings.
6. Deploy the whole folder (GitHub Pages or any static host) keeping the same paths.
7. Test an inquiry from a private browser window, then sign in at `/admin.html`.

## If a photo does not show
Run `supabase-fix-images.sql` (bucket must be public). Then in Admin → Properties click **Edit** on that property and upload the photo again.

## Security notes
- Visitors can insert inquiries but cannot read them. Admin access is enforced by RLS via `admin_users`.
- Add CAPTCHA / rate limiting before paid traffic campaigns.
- Configure allowed redirect URLs and site URL in Supabase Auth.
- The privacy notice is a starter only; have it reviewed for your business and states.
- This is a lead-generation starter, not a brokerage license, MLS feed, fair-housing review, or legal advice.
- Use only photos you have permission to use.
