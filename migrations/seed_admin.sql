-- Create admin user
-- Email   : bkhrakmal@gmail.com
-- Password: Admin@1234  (change after first login!)
--
-- Run with:
-- wrangler d1 execute smm-panel-db --file=migrations/seed_admin.sql

INSERT OR IGNORE INTO users (
  name,
  email,
  password,
  balance,
  total_spent,
  total_orders,
  api_key,
  referral_code,
  role
) VALUES (
  'Admin',
  'bkhrakmal@gmail.com',
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:14a592602ccc4d742c3aa8152af5839306c04a5a4d664096e197104b84c473cf',
  0,
  0,
  0,
  'sk_admin_' || lower(hex(randomblob(16))),
  'ADMIN001',
  'admin'
);
