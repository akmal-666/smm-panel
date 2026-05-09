/**
 * functions/api/transactions.js
 * GET  /api/transactions  - list user transactions
 * POST /api/transactions  - add funds (admin/payment gateway callback)
 */
import { json, err, cors, requireAuth } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const txns = await env.DB.prepare(
    'SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50'
  ).bind(payload.sub).all();

  return json({ success: true, transactions: txns.results });
}

// Add funds - in production this would be called by payment gateway webhook
// Protected by a webhook secret
export async function onRequestPost(context) {
  const { request, env } = context;

  // Check webhook secret for payment gateway callbacks
  const webhookSecret = request.headers.get('X-Webhook-Secret');
  const isWebhook = webhookSecret && webhookSecret === (env.WEBHOOK_SECRET || '');

  // Or allow authenticated users to add funds (demo/manual top-up)
  const payload = isWebhook ? null : await requireAuth(request, env);
  if (!isWebhook && !payload) return err('Unauthorized', 401);

  const body = await request.json();
  const { user_id, amount, description, ref_id } = body;

  const targetUserId = isWebhook ? user_id : payload.sub;
  if (!targetUserId || !amount || amount <= 0) return err('Invalid request');

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO transactions (user_id, type, amount, description, ref_id)
       VALUES (?, 'credit', ?, ?, ?)`
    ).bind(targetUserId, parseFloat(amount), description || 'Deposit', ref_id || null),

    env.DB.prepare(
      `UPDATE users SET balance=balance+?, updated_at=datetime('now') WHERE id=?`
    ).bind(parseFloat(amount), targetUserId),
  ]);

  const user = await env.DB.prepare(
    'SELECT id,name,email,balance FROM users WHERE id=?'
  ).bind(targetUserId).first();

  return json({ success: true, balance: user.balance });
}
