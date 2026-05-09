/**
 * functions/api/auth/login.js
 * POST /api/auth/login
 */
import { json, err, cors, verifyPassword, signJwt } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { email, password } = await request.json();
    if (!email || !password) return err('Email and password are required');

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first();

    if (!user) return err('Invalid email or password', 401);

    const valid = await verifyPassword(password, user.password);
    if (!valid) return err('Invalid email or password', 401);

    const token = await signJwt(
      { sub: user.id, email: user.email, role: user.role },
      env.JWT_SECRET || 'change-this-secret'
    );

    return json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: user.balance,
        total_spent: user.total_spent,
        total_orders: user.total_orders,
        api_key: user.api_key,
        referral_code: user.referral_code,
        role: user.role,
      },
    });
  } catch (e) {
    return err('Server error: ' + e.message, 500);
  }
}
