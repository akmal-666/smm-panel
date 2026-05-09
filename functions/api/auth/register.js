/**
 * functions/api/auth/register.js
 * POST /api/auth/register
 */
import { json, err, cors, hashPassword, signJwt, randomString } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { name, email, password, referral_code } = await request.json();
    if (!name || !email || !password) return err('Name, email and password are required');
    if (password.length < 8) return err('Password must be at least 8 characters');

    const cleanEmail = email.toLowerCase().trim();

    // Check existing
    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(cleanEmail).first();
    if (existing) return err('Email already registered', 409);

    // Handle referral
    let referredBy = null;
    if (referral_code) {
      const referrer = await env.DB.prepare(
        'SELECT id FROM users WHERE referral_code = ?'
      ).bind(referral_code).first();
      if (referrer) referredBy = referrer.id;
    }

    const hashedPw = await hashPassword(password);
    const apiKey = 'sk_' + randomString(32);
    const refCode = randomString(8).toUpperCase();

    const result = await env.DB.prepare(
      `INSERT INTO users (name, email, password, api_key, referral_code, referred_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name.trim(), cleanEmail, hashedPw, apiKey, refCode, referredBy).run();

    const userId = result.meta.last_row_id;

    const token = await signJwt(
      { sub: userId, email: cleanEmail, role: 'user' },
      env.JWT_SECRET || 'change-this-secret'
    );

    return json({
      success: true,
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        balance: 0,
        total_spent: 0,
        total_orders: 0,
        api_key: apiKey,
        referral_code: refCode,
        role: 'user',
      },
    }, 201);
  } catch (e) {
    return err('Server error: ' + e.message, 500);
  }
}
