/**
 * SMM Panel Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 1. Replace API_KEY with your provider API key
 * 2. Replace API_URL with your provider's API endpoint
 * 3. For Peakerr: https://peakerr.com/api/v2
 * 4. For JustAnotherPanel: https://justanotherpanel.com/api/v2
 * 5. For SMMFollows: https://smmfollows.com/api/v2
 * 
 * RECOMMENDED PROVIDERS (cheapest):
 * - JustAnotherPanel (JAP): Very cheap, reliable
 * - SMMFollows: Good rates, fast delivery
 * - Peakerr: Popular, wide service range
 */

const CONFIG = {
  // ============================================================
  // PROVIDER SETTINGS - Change these to your provider details
  // ============================================================
  
  // Your SMM provider API endpoint
  // Since we're on Cloudflare Pages, API calls go through /api/proxy
  PROVIDER_API_URL: 'https://justanotherpanel.com/api/v2',
  
  // Your provider API key (set this in Cloudflare Pages environment variables)
  // Variable name: PROVIDER_API_KEY
  PROVIDER_API_KEY: '',

  // ============================================================
  // APP SETTINGS
  // ============================================================
  APP_NAME: 'SMMSpot',
  APP_URL: window.location.origin,
  CURRENCY: 'USD',
  CURRENCY_SYMBOL: '$',
  
  // Minimum deposit amount
  MIN_DEPOSIT: 1,
  
  // Default commission for referrals (%)
  REFERRAL_COMMISSION: 5,

  // ============================================================
  // DEMO MODE - Set to false when you have real API credentials
  // ============================================================
  DEMO_MODE: true,
};

// Demo data for testing without real API
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
    { service: 1001, name: 'Instagram - Followers | Real | Instant', category: 'Instagram', rate: '0.50', min: 100, max: 100000, type: 'Default' },
    { service: 1002, name: 'Instagram - Likes | Real | Fast', category: 'Instagram', rate: '0.20', min: 50, max: 50000, type: 'Default' },
    { service: 1003, name: 'Instagram - Views | Reel | TV | 30D - INSTANT', category: 'Instagram', rate: '0.083', min: 100, max: 1000000, type: 'Default' },
    { service: 1004, name: 'Instagram - Comments | Custom', category: 'Instagram', rate: '2.50', min: 10, max: 500, type: 'Custom Comments' },
    { service: 1005, name: 'Instagram - Story Views | Fast', category: 'Instagram', rate: '0.15', min: 100, max: 100000, type: 'Default' },
    { service: 2001, name: 'TikTok - Followers | Real | Fast', category: 'TikTok', rate: '0.80', min: 100, max: 50000, type: 'Default' },
    { service: 2002, name: 'TikTok - Likes | Instant', category: 'TikTok', rate: '0.10', min: 50, max: 100000, type: 'Default' },
    { service: 2003, name: 'TikTok - Views | Fast Delivery', category: 'TikTok', rate: '0.05', min: 1000, max: 10000000, type: 'Default' },
    { service: 2004, name: 'TikTok - Shares | Real', category: 'TikTok', rate: '0.30', min: 100, max: 10000, type: 'Default' },
    { service: 3001, name: 'YouTube - Views | High Retention | 30D Refill', category: 'YouTube', rate: '1.20', min: 500, max: 500000, type: 'Default' },
    { service: 3002, name: 'YouTube - Subscribers | Real | Slow', category: 'YouTube', rate: '3.50', min: 100, max: 10000, type: 'Default' },
    { service: 3003, name: 'YouTube - Likes | Fast', category: 'YouTube', rate: '0.40', min: 50, max: 50000, type: 'Default' },
    { service: 4001, name: 'Twitter/X - Followers | Real | Fast', category: 'Twitter/X', rate: '1.50', min: 100, max: 50000, type: 'Default' },
    { service: 4002, name: 'Twitter/X - Likes | Instant', category: 'Twitter/X', rate: '0.25', min: 50, max: 50000, type: 'Default' },
    { service: 4003, name: 'Twitter/X - Retweets | Fast', category: 'Twitter/X', rate: '0.50', min: 50, max: 10000, type: 'Default' },
    { service: 5001, name: 'Facebook - Page Likes | Real', category: 'Facebook', rate: '1.80', min: 100, max: 50000, type: 'Default' },
    { service: 5002, name: 'Facebook - Post Likes | Fast', category: 'Facebook', rate: '0.30', min: 50, max: 50000, type: 'Default' },
    { service: 5003, name: 'Facebook - Video Views | Fast', category: 'Facebook', rate: '0.10', min: 500, max: 1000000, type: 'Default' },
    { service: 6001, name: 'Spotify - Plays | Real | Fast', category: 'Spotify', rate: '0.08', min: 1000, max: 10000000, type: 'Default' },
    { service: 6002, name: 'Spotify - Followers | Real', category: 'Spotify', rate: '2.00', min: 100, max: 10000, type: 'Default' },
  ],
  orders: [
    { order: 10001, service: 1001, link: 'https://instagram.com/user1', quantity: 1000, start_count: 500, remains: 0, status: 'Completed', charge: '0.50' },
    { order: 10002, service: 2001, link: 'https://tiktok.com/@user2', quantity: 500, start_count: 200, remains: 100, status: 'Processing', charge: '0.40' },
    { order: 10003, service: 3001, link: 'https://youtube.com/watch?v=xxx', quantity: 5000, start_count: 0, remains: 5000, status: 'Pending', charge: '6.00' },
    { order: 10004, service: 1002, link: 'https://instagram.com/p/xxx', quantity: 2000, start_count: 1800, remains: 200, status: 'Partial', charge: '0.40' },
    { order: 10005, service: 4001, link: 'https://twitter.com/user5', quantity: 300, start_count: 300, remains: 0, status: 'Completed', charge: '0.45' },
  ],
};
