/**
 * SMM Panel Configuration
 *
 * PRODUCTION SETUP:
 * 1. Set DEMO_MODE = false
 * 2. Set environment variables in Cloudflare Pages:
 *    - PROVIDER_API_URL  (e.g. https://justanotherpanel.com/api/v2)
 *    - PROVIDER_API_KEY  (your provider API key)
 *    - JWT_SECRET        (random string, min 32 chars)
 *    - WEBHOOK_SECRET    (for payment gateway callbacks)
 * 3. Create D1 database and run migrations/schema.sql
 */

const CONFIG = {
  // ── Set to false for production ──
  DEMO_MODE: false,

  APP_NAME: 'SMMSpot',
  APP_URL: window.location.origin,
  CURRENCY: 'USD',
  CURRENCY_SYMBOL: '$',
  MIN_DEPOSIT: 1,
  REFERRAL_COMMISSION: 5,
};

// Demo data only used when DEMO_MODE = true
const DEMO_DATA = {
  user: {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    balance: 10590.00,
    total_spent: 10590.00,
    total_orders: 10,
    api_key: 'demo_api_key_' + Math.random().toString(36).substr(2, 16),
    referral_code: 'JOHN123',
  },
  services: [
    { service: 1001, name: 'Instagram - Followers | Real | Instant', category: 'Instagram', rate: '0.50', min: 100, max: 100000 },
    { service: 1002, name: 'Instagram - Likes | Real | Fast', category: 'Instagram', rate: '0.20', min: 50, max: 50000 },
    { service: 1003, name: 'Instagram - Views | Reel | TV | 30D - INSTANT', category: 'Instagram', rate: '0.083', min: 100, max: 1000000 },
    { service: 1004, name: 'Instagram - Story Views | Fast', category: 'Instagram', rate: '0.15', min: 100, max: 100000 },
    { service: 2001, name: 'TikTok - Followers | Real | Fast', category: 'TikTok', rate: '0.80', min: 100, max: 50000 },
    { service: 2002, name: 'TikTok - Likes | Instant', category: 'TikTok', rate: '0.10', min: 50, max: 100000 },
    { service: 2003, name: 'TikTok - Views | Fast Delivery', category: 'TikTok', rate: '0.05', min: 1000, max: 10000000 },
    { service: 3001, name: 'YouTube - Views | High Retention | 30D Refill', category: 'YouTube', rate: '1.20', min: 500, max: 500000 },
    { service: 3002, name: 'YouTube - Subscribers | Real | Slow', category: 'YouTube', rate: '3.50', min: 100, max: 10000 },
    { service: 4001, name: 'Twitter/X - Followers | Real | Fast', category: 'Twitter/X', rate: '1.50', min: 100, max: 50000 },
    { service: 5001, name: 'Facebook - Page Likes | Real', category: 'Facebook', rate: '1.80', min: 100, max: 50000 },
    { service: 6001, name: 'Spotify - Plays | Real | Fast', category: 'Spotify', rate: '0.08', min: 1000, max: 10000000 },
  ],
  orders: [
    { order: 10001, service: 1001, link: 'https://instagram.com/user1', quantity: 1000, start_count: 500, remains: 0, status: 'Completed', charge: '0.50' },
    { order: 10002, service: 2001, link: 'https://tiktok.com/@user2', quantity: 500, start_count: 200, remains: 100, status: 'Processing', charge: '0.40' },
    { order: 10003, service: 3001, link: 'https://youtube.com/watch?v=xxx', quantity: 5000, start_count: 0, remains: 5000, status: 'Pending', charge: '6.00' },
  ],
};
