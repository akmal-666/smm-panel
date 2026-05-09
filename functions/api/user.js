/**
 * functions/api/user.js
 * GET  /api/user  - get current user profile
 * PUT  /api/user  - update profile
 */
import { json, err, cors, requireAuth, hashPassword, verifyPassword } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const user = await env.DB.prepare(
    'SELECT id,name,email,balance,total_spent,total_orders,api_key,referral_code,role,created_at FROM users WHERE id=?'
  ).bind(payload.sub).first();

  if (!user) return err('User not found', 404);
  return json({ success: true, user });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const body = await request.json();
  const { name, current_password, new_password } = body;

  if (new_password) {
    if (new_password.length < 8) return err('New password must be at least 8 characters');
    const user = await env.DB.prepare('SELECT password FROM users WHERE id=?').bind(payload.sub).first();
    const valid = await verifyPassword(current_password || '', user.password);
    if (!valid) return err('Current password is incorrect', 403);
    const hashed = await hashPassword(new_password);
    await env.DB.prepare('UPDATE users SET password=?, updated_at=datetime("now") WHERE id=?')
      .bind(hashed, payload.sub).run();
  }

  if (name) {
    await env.DB.prepare('UPDATE users SET name=?, updated_at=datetime("now") WHERE id=?')
      .bind(name.trim(), payload.sub).run();
  }

  const updated = await env.DB.prepare(
    'SELECT id,name,email,balance,total_spent,total_orders,api_key,referral_code,role FROM users WHERE id=?'
  ).bind(payload.sub).first();

  return json({ success: true, user: updated });
}
