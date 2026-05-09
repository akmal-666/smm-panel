/**
 * functions/_utils.js
 * Shared utilities for Cloudflare Pages Functions
 * Uses Web Crypto API (built-in to CF Workers runtime)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Security headers ditambahkan ke semua response
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function cors() {
  return new Response(null, { status: 204, headers: { ...CORS, ...SECURITY_HEADERS } });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

// ── Input sanitization ──
export function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

export function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  // Hanya izinkan http/https
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return '';
  // Batasi panjang
  if (trimmed.length > 2048) return '';
  return trimmed;
}

// ── Password hashing (PBKDF2 via Web Crypto) ──
export async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return saltHex + ':' + hashHex;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const newHash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return newHash === hashHex;
}

// ── JWT (HS256 via Web Crypto) ──
async function getJwtKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function signJwt(payload, secret, expiresInHours = 168) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + expiresInHours * 3600 };
  const data = b64url(new TextEncoder().encode(JSON.stringify(header))) + '.' +
               b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await getJwtKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return data + '.' + b64url(sig);
}

export async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const key = await getJwtKey(secret);
    const sigBuf = Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBuf, new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!valid) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Auth middleware ──
// SECURITY: Tolak request jika JWT_SECRET tidak di-set di environment
export async function requireAuth(request, env) {
  if (!env.JWT_SECRET) {
    console.error('SECURITY: JWT_SECRET tidak di-set di environment variables!');
    return null;
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyJwt(token, env.JWT_SECRET);
}

// ── Rate limiting via Cloudflare KV (opsional, graceful degradation) ──
// Key: "rl:{ip}:{action}", Value: count, TTL: window seconds
export async function checkRateLimit(env, ip, action, maxAttempts = 10, windowSec = 900) {
  if (!env.KV) return true; // KV tidak tersedia, skip rate limiting
  const key = `rl:${ip}:${action}`;
  try {
    const current = parseInt(await env.KV.get(key) || '0');
    if (current >= maxAttempts) return false; // blocked
    await env.KV.put(key, String(current + 1), { expirationTtl: windowSec });
    return true;
  } catch {
    return true; // error KV, izinkan request
  }
}

// ── Random string ──
export function randomString(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

// ── Kurs USD → IDR real-time ──
export async function getUsdToIdr(env) {
  const fallback = parseFloat(env?.USD_TO_IDR) || 16300;
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const rate = data?.rates?.IDR;
    if (!rate || isNaN(rate)) return fallback;
    return parseFloat(rate);
  } catch {
    return fallback;
  }
}
