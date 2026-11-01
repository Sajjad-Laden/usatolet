# USA Real Estate — starter website

A responsive English real-estate lead-generation website with Supabase data storage and a protected admin dashboard.

## Files
- `index.html` — public homepage, property search, inquiry form
- `admin.html` — admin sign-in, lead list/status updates, add/activate properties
- `privacy.html` — starter privacy notice (must be customized)
- `styles.css`, `admin.css` — responsive styling
- `js/config.js` — Supabase URL and publishable key
- `js/app.js`, `js/admin.js` — frontend behavior
- `js/export.js`, `js/xlsx-lite.js` — "Download Excel" for leads (small built-in writer, no external library)
- `js/quickfill.js` — reads a pasted Facebook post and fills the property form
- `features.css` — styles for the selected-property box, photo upload and lead table
- `supabase-schema.sql` — database tables, grants, Row Level Security policies, and the v2 upgrade (optional email, property link on leads, property type, photo storage bucket)

## Features
- Visitors pick a property with "Request details"; the inquiry is saved with that property. Email is optional.
- Every property has a shareable link: `index.html?property=<id>` (use "Copy link" in Admin → Properties for Facebook posts etc.).
- Admin → Properties: upload as many photos as you want per property (select many at once or drag & drop; "Make cover" chooses the first photo). Each photo is resized to max 1600px and stored in the `property-images` bucket. Visitors can swipe through the photos on the card and open them full size.
- Admin → Properties → "Quick fill from your Facebook post": paste the text of a Facebook / Marketplace post and the form fills itself (price, beds, baths, type, address, city, state, ZIP, size). Phone numbers, emails and links are removed from the public description. Check the fields, add the photos, save.
- The original Facebook post link can be saved with each property. It is used as "Post List" in the Excel export (the website link of the listing is always in the last column, "Website Link").
- A website cannot read a Facebook post from its link (Facebook blocks it and its terms forbid automated collection), so the text is pasted and the photos are added from your computer.
- Admin → Customer leads: shows each lead's property and "Download Excel" exports all leads in your sheet layout (Traffic Name, Number, Rent / Price, House, Address, Post List, Text Link, Id name, then Email, Interest, Status, Message, Date).

## Setup
1. In Supabase SQL Editor, run `supabase-schema.sql`.
2. `js/config.js` already contains this project's URL and **publishable** key. Never use a `service_role` or secret key in browser code.
3. In Supabase Dashboard → Authentication → Users, create the admin user using the authorized admin email. Set a strong unique password and enable MFA if available.
4. Open `supabase-make-admin.sql`, replace `YOUR_ADMIN_EMAIL` with that user's email, and run it in the SQL Editor (no UUID copying needed). It should return exactly 1 row.
5. Optional: run `supabase-sample-properties.sql` to add 3 test listings (replace with real listings before launch).
6. Deploy the folder to GitHub Pages or another static host. Ensure `index.html`, `admin.html`, `privacy.html`, CSS, and JS files keep the same relative paths.
6. Test an inquiry from a private/incognito browser. Then sign in at `/admin.html` and verify the lead is visible.

## Security notes
- Public visitors can insert inquiries but cannot read them.
- Admin authorization is checked against `admin_users`; the database RLS policies enforce access.
- Never expose Supabase secret/service-role keys in frontend files.
- Add CAPTCHA/anti-spam and server-side rate limiting before running paid traffic campaigns. Consider a Supabase Edge Function or trusted server endpoint for stronger abuse controls.
- Configure allowed redirect URLs and site URL in Supabase Auth.
- The privacy notice is a starter only. Have it reviewed and completed for your business and the states in which you operate.
- This is a lead-generation website starter, not a brokerage license, MLS feed, fair-housing compliance review, or legal advice.

## Important image note
Replace the sample image URLs with licensed property photography you have permission to use. Update the hero image URL in `styles.css` if you want a different hero photo.
