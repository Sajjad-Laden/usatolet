-- OPTIONAL: 3 sample listings so the homepage is not empty while you test.
-- Delete them later from the Admin dashboard (Deactivate) or Table Editor.
-- Replace these with YOUR real listings and licensed photos before going live.

insert into public.properties
  (title, description, price, listing_type, address, city, state, zip_code, beds, baths, sqft, image_url, is_active)
values
  ('Sample: Modern 2-Bedroom Apartment', 'Sample listing for testing only.', 2400, 'rent',
   '100 Sample St', 'Brooklyn', 'NY', '11201', 2, 1, 950,
   'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80', true),
  ('Sample: Family Home with Garden', 'Sample listing for testing only.', 485000, 'sale',
   '200 Sample Ave', 'Houston', 'TX', '77002', 4, 2.5, 2200,
   'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80', true),
  ('Sample: Sunny Studio Near Downtown', 'Sample listing for testing only.', 1450, 'rent',
   '300 Sample Blvd', 'Miami', 'FL', '33130', 1, 1, 520,
   'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80', true);
