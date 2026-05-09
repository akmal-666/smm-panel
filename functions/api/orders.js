/**
 * functions/api/orders.js
 * GET  /api/orders        - list user orders
 * POST /api/orders        - place new order
 * GET  /api/orders/[id]   - get single order status
 */
import { json, err, cors, requireAuth } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

// GET - list orders
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const orders = await env.DB.prepare(
    'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100'
  ).bind(payload.sub).all();

  return json({ success: true, orders: orders.results });
}

// POST - place order
export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const { service_id, service_name, link, quantity } = await request.json();
  if (!service_id || !link || !quantity) return err('Missing required fields');

  // Get user balance
  const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(payload.sub).first();
  if (!user) return err('User not found', 404);

  // Call provider API
  const PROVIDER_URL = env.PROVIDER_API_URL;
  const PROVIDER_KEY = env.PROVIDER_API_KEY;

  if (!PROVIDER_URL || !PROVIDER_KEY) {
    return err('Provider API not configured', 503);
  }

  let providerOrderId = null;
  let charge = 0;

  try {
    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', 'add');
    formData.append('service', service_id);
    formData.append('link', link);
    formData.append('quantity', quantity);

    const provRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const provData = await provRes.json();
    if (provData.error) return err('Provider error: ' + provData.error);
    providerOrderId = provData.order;
    charge = parseFloat(provData.charge || 0);
  } catch (e) {
    return err('Failed to contact provider: ' + e.message, 502);
  }

  // Check balance
  if (user.balance < charge) return err('Insufficient balance');

  // Deduct balance & save order in one transaction
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orders (user_id, provider_order_id, service_id, service_name, link, quantity, charge, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`
    ).bind(payload.sub, String(providerOrderId), String(service_id), service_name || '', link, quantity, charge),

    env.DB.prepare(
      `UPDATE users SET balance=balance-?, total_spent=total_spent+?, total_orders=total_orders+1,
       updated_at=datetime('now') WHERE id=?`
    ).bind(charge, charge, payload.sub),

    env.DB.prepare(
      `INSERT INTO transactions (user_id, type, amount, description, ref_id)
       VALUES (?, 'debit', ?, ?, ?)`
    ).bind(payload.sub, charge, 'Order #' + providerOrderId + ' - ' + (service_name || service_id), String(providerOrderId)),
  ]);

  return json({ success: true, order: providerOrderId, charge }, 201);
}
