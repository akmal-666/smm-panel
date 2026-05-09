/**
 * functions/api/transactions.js
 * GET  /api/transactions  - list user transactions (auth required)
 * POST /api/transactions  - add funds via webhook (webhook secret required)
 *
 * Security:
 * - GET: hanya bisa lihat transaksi sendiri
 * - POST: hanya via webhook dengan secret yang valid
 *   User tidak bisa top up sendiri — hanya admin via /api/admin/users
 */
import { json, err, cors, requireAuth } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

// GET - list transaksi milik user yang sedang login
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const txns = await env.DB.prepare(
    'SELECT id,type,amount,description,ref_id,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50'
  ).bind(payload.sub).all();

  return json({ success: true, transactions: txns.results });
}

// POST - hanya untuk payment gateway webhook
// User biasa tidak bisa top up sendiri
export async function onRequestPost(context) {
  const { request, env } = context;

  // SECURITY: Wajib ada WEBHOOK_SECRET di environment
  if (!env.WEBHOOK_SECRET) return err('Webhook not configured', 503);

  const webhookSecret = request.headers.get('X-Webhook-Secret');
  if (!webhookSecret || webhookSecret !== env.WEBHOOK_SECRET) {
    return err('Unauthorized', 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON body');
  }

  const { user_id, amount, description, ref_id } = body;

  if (!user_id || !amount) return err('user_id dan amount wajib diisi');
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) return err('Amount tidak valid');
  if (parsedAmount > 100_000_000) return err('Amount melebihi batas maksimum'); // max 100 juta

  // Pastikan user ada
  const user = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(parseInt(user_id)).first();
  if (!user) return err('User tidak ditemukan', 404);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO transactions (user_id, type, amount, description, ref_id)
       VALUES (?, 'credit', ?, ?, ?)`
    ).bind(parseInt(user_id), parsedAmount, description || 'Deposit', ref_id || null),
    env.DB.prepare(
      `UPDATE users SET balance=balance+?, updated_at=datetime('now') WHERE id=?`
    ).bind(parsedAmount, parseInt(user_id)),
  ]);

  return json({ success: true });
}
