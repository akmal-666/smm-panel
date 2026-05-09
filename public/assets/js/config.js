/**
 * SMM Panel Configuration
 *
 * PRODUCTION SETUP:
 * 1. Set DEMO_MODE = false
 * 2. Set environment variables in Cloudflare Pages dashboard:
 *    - PROVIDER_API_URL  → https://asokapanel.com/api/v2
 *    - PROVIDER_API_KEY  → API key dari dashboard AsokaPanel
 *    - JWT_SECRET        → random string min 32 karakter
 *    - WEBHOOK_SECRET    → secret untuk callback payment gateway
 * 3. Buat D1 database dan jalankan migrations/schema.sql
 *
 * ASOKAPANEL SETUP:
 * - Daftar di https://asokapanel.com
 * - Masuk ke menu API → copy API Key
 * - Set PROVIDER_API_URL = https://asokapanel.com/api/v2
 * - Set PROVIDER_API_KEY = <api key kamu>
 */

const CONFIG = {
  // ── Set to false for production ──
  DEMO_MODE: false,

  APP_NAME: 'BronetSMM',
  APP_URL: window.location.origin,

  // ── Currency: IDR untuk AsokaPanel ──
  CURRENCY: 'IDR',
  CURRENCY_SYMBOL: 'Rp',

  // Minimum deposit dalam IDR
  MIN_DEPOSIT: 10000,

  // Markup harga dari provider (2.0 = 100% markup, harga jual 2x harga provider)
  PRICE_MARKUP: 2.0,

  REFERRAL_COMMISSION: 5,
};

// Demo data only used when DEMO_MODE = true
// Harga dalam IDR (sudah termasuk markup 30%)
const DEMO_DATA = {
  user: {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    balance: 150000,
    total_spent: 85000,
    total_orders: 10,
    api_key: 'demo_api_key_' + Math.random().toString(36).substring(2, 18),
    referral_code: 'JOHN123',
  },
  services: [
    // Instagram
    { service: 1001, name: 'Instagram - Followers | Real | Instant', category: 'Instagram', rate: '8500', min: 100, max: 100000 },
    { service: 1002, name: 'Instagram - Likes | Real | Fast', category: 'Instagram', rate: '3500', min: 50, max: 50000 },
    { service: 1003, name: 'Instagram - Views | Reel | TV | 30D - INSTANT', category: 'Instagram', rate: '1500', min: 100, max: 1000000 },
    { service: 1004, name: 'Instagram - Story Views | Fast', category: 'Instagram', rate: '2500', min: 100, max: 100000 },
    // TikTok
    { service: 2001, name: 'TikTok - Followers | Real | Fast', category: 'TikTok', rate: '15000', min: 100, max: 50000 },
    { service: 2002, name: 'TikTok - Likes | Instant', category: 'TikTok', rate: '2000', min: 50, max: 100000 },
    { service: 2003, name: 'TikTok - Views | Fast Delivery', category: 'TikTok', rate: '900', min: 1000, max: 10000000 },
    // YouTube
    { service: 3001, name: 'YouTube - Views | High Retention | 30D Refill', category: 'YouTube', rate: '22000', min: 500, max: 500000 },
    { service: 3002, name: 'YouTube - Subscribers | Real | Slow', category: 'YouTube', rate: '65000', min: 100, max: 10000 },
    // Facebook
    { service: 5001, name: 'Facebook - Page Likes | Real', category: 'Facebook', rate: '33000', min: 100, max: 50000 },
    { service: 5002, name: 'Facebook - Followers | Real', category: 'Facebook', rate: '28000', min: 100, max: 50000 },
    // Twitter/X
    { service: 4001, name: 'Twitter/X - Followers | Real | Fast', category: 'Twitter/X', rate: '27000', min: 100, max: 50000 },
    // Spotify
    { service: 6001, name: 'Spotify - Plays | Real | Fast', category: 'Spotify', rate: '1500', min: 1000, max: 10000000 },
  ],
  orders: [
    { order: 10001, service: 1001, link: 'https://instagram.com/user1', quantity: 1000, start_count: 500, remains: 0, status: 'Completed', charge: '8500' },
    { order: 10002, service: 2001, link: 'https://tiktok.com/@user2', quantity: 500, start_count: 200, remains: 100, status: 'Processing', charge: '7500' },
    { order: 10003, service: 3001, link: 'https://youtube.com/watch?v=xxx', quantity: 5000, start_count: 0, remains: 5000, status: 'Pending', charge: '110000' },
  ],
};
