/**
 * functions/api/admin/sync.js
 * POST /api/admin/sync
 *
 * Sync status semua order aktif (Pending/Processing) dari AsokaPanel ke DB
 * Bisa dipanggil manual oleh admin atau via Cloudflare Cron Trigger
 */
import { json, err, cors, requireAuth } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  // Cek auth — admin atau cron secret
  const cronSecret = request.headers.get('X-Cron-Secret');
  const isCron = cronSecret && cronSecret === (env.CRON_SECRET || '');

  if (!isCron) {
    const payload = await requireAuth(request, env);
    if (!payload) return err('Unauthorized', 401);
    const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(payload.sub).first();
    if (!user || user.role !== 'admin') return err('Forbidden', 403);
  }

  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://indosmm.id/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY;
  if (!PROVIDER_KEY) return err('Provider API belum dikonfigurasi', 503);

  // Ambil semua order yang masih aktif
  const activeOrders = await env.DB.prepare(
    `SELECT provider_order_id, user_id FROM orders
     WHERE status NOT IN ('Completed', 'Cancelled', 'Partial')
     AND provider_order_id IS NOT NULL
     AND provider_order_id != ''
     ORDER BY created_at DESC
     LIMIT 100`
  ).all();

  const orderList = activeOrders.results || [];
  if (!orderList.length) {
    return json({ success: true, message: 'Tidak ada order aktif', synced: 0 });
  }

  // Batch request ke AsokaPanel (max 100 IDs)
  const ids = orderList.map(o => o.provider_order_id);
  let providerData = {};

  try {
    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', 'status');
    formData.append('orders', ids.join(','));

    const provRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!provRes.ok) return err('Provider error: HTTP ' + provRes.status, 502);
    providerData = await provRes.json();
  } catch (e) {
    return err('Gagal menghubungi provider: ' + e.message, 502);
  }

  // Update DB untuk setiap order yang ada datanya
  let synced = 0;
  const updates = [];

  for (const [orderId, info] of Object.entries(providerData)) {
    if (!info || info.error || !info.status) continue;
    updates.push(
      env.DB.prepare(
        `UPDATE orders SET status=?, start_count=?, remains=?, updated_at=datetime('now')
         WHERE provider_order_id=?`
      ).bind(
        info.status,
        parseInt(info.start_count) || 0,
        parseInt(info.remains) || 0,
        String(orderId)
      )
    );
    synced++;
  }

  if (updates.length > 0) {
    // Batch update, max 100 per batch (D1 limit)
    for (let i = 0; i < updates.length; i += 100) {
      await env.DB.batch(updates.slice(i, i + 100));
    }
  }

  return json({
    success: true,
    message: `Sync selesai: ${synced} order diupdate dari ${ids.length} order aktif`,
    synced,
    total_active: ids.length,
  });
}
