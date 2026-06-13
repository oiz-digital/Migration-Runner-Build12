-- Zebvix brand / company settings seed
-- Upserted into the app_settings table on every deploy.
-- Any value already set in the admin panel takes precedence (ON CONFLICT DO NOTHING).

INSERT INTO app_settings (key, value) VALUES
  ('brand.legal_name',    'Zebvix Technologies Private Limited'),
  ('brand.trading_name',  'Zebvix Exchange'),
  ('brand.short',         'Zebvix'),
  ('brand.address',       '105, Vill Subari, Shamli, Jhinjhana, Kairana, Muzaffarnagar — 247773, Uttar Pradesh, India'),
  ('brand.gstin',         '29AACCZ9728R1ZK'),
  ('brand.pan',           'AACCZ9728R'),
  ('brand.tan',           'MRTZ01489F'),
  ('brand.cin',           'U66190UW2026PTC251591'),
  ('brand.support_email', 'support@zebvix.com'),
  ('brand.website',       'https://zebvix.com')
ON CONFLICT (key) DO NOTHING;
