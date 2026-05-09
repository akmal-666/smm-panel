/**
 * functions/api/auth/login.js
 * POST /api/auth/login
 *
 * Security:
 * - Rate limiting: 5 attempts per 15 menit per IP (jika KV tersedia)
 * - Generic error message (tidak membedakan email vs password salah)
 * - JWT_SECRET wajib di-set di environment
 */
import { json, err, cors, verifyPassword, signJwt, checkRateLimit } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  // SECURITY: Wajib ada JWT_SECRET
  if (!env.JWT_SECRET) return err('Server misconfiguration', 500);

  // Rate limiting: 5 percobaan per 15 menit per IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env, ip, 'login', 5, 900);
  if (!allowed) return err('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return err('Invalid request body', 400);
    }

    const { email, password } = body;
    if (!email || !password) return err('Email dan password wajib diisi');

    // Validasi format email sederhana
    if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
      return err('Format email tidak valid');
    }
    if (typeof password !== 'string' || password.length > 128) {
      return err('Password tidak valid');
    }

    const user = await env.DB.prepare(
      'SELECT id,name,email,password,balance,total_spent,total_orders,api_key,referral_code,role FROM users WHERE email=?'
    ).bind(email.toLowerCase().trim()).first();

    // Gunakan pesan error yang sama untuk email/password salah (mencegah user enumeration)
    if (!user) {
      await new Promise(r => setTimeout(r, 300)); // timing attack mitigation
      return err('Email atau password salah', 401);
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) return err('Email atau password salah', 401);

    const token = await signJwt(
      { sub: user.id, email: user.email, role: user.role },
      env.JWT_SECRET
    );

    // SECURITY: Jangan return api_key di login response
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
        referral_code: user.referral_code,
        role: user.role,
        // api_key tidak dikembalikan di sini — fetch via GET /api/user
      },
    });
  } catch (e) {
    // SECURITY: Jangan expose detail error ke client
    console.error('Login error:', e.message);
    return err('Terjadi kesalahan server', 500);
  }
}
