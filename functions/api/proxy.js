/**
 * functions/api/proxy.js
 * POST /api/proxy  - proxy to SMM provider + sync order status to D1
 */
import { json, err, cors, requireAuth } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  const PROVIDER_URL = env.PROVIDER_API_URL;
  const PROVIDER_KEY = env.PROVIDER_API_KEY;

  if (!PROVIDER_URL || !PROVIDER_KEY) {
    return err('Provider API not configured. Set PROVIDER_API_URL and PROVIDER_API_KEY in environment variables.', 503);
  }

  // Auth required for status/services actions
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  try {
    const body = await request.json();
    const { action, order, orders } = body;

    if (!action) return err('Missing action');

    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', action);

    if (action === 'status' && order) {
      formData.append('order', order);
    }
    if (action === 'status' && orders) {
      formData.append('orders', Array.isArray(orders) ? orders.join(',') : orders);
    }

    const provRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!provRes.ok) return err('Provider error: ' + provRes.status, 502);
    const data = await provRes.json();

    // Sync order status back to D1
    if (action === 'status' && order && data.status && env.DB) {
      await env.DB.prepare(
        `UPDATE orders SET status=?, start_count=?, remains=?, updated_at=datetime('now')
         WHERE provider_order_id=? AND user_id=?`
      ).bind(data.status, data.start_count || 0, data.remains || 0, String(order), payload.sub).run();
    }

    return json(data);
  } catch (e) {
    return err('Internal error: ' + e.message, 500);
  }
}
