/**
 * functions/api/proxy.js
 * POST /api/proxy  - proxy ke AsokaPanel API + sync status order ke D1
 *
 * AsokaPanel API: https://asokapanel.com/api/v2
 * Docs: https://asokapanel.com/api
 *
 * Actions yang didukung:
 *   - services  : ambil daftar layanan
 *   - status    : cek status 1 order (param: order)
 *   - status    : cek status banyak order (param: orders = "1,2,3")
 *   - balance   : cek saldo di AsokaPanel
 */
import { json, err, cors, requireAuth, getUsdToIdr } from '../_utils.js';

// Markup harga dari provider (2.0 = 100% markup, harga jual 2x harga provider)
const PRICE_MARKUP = 2.0;

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://asokapanel.com/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY;

  if (!PROVIDER_KEY) {
    return err('Provider API belum dikonfigurasi. Set PROVIDER_API_KEY di environment variables Cloudflare Pages.', 503);
  }

  // Semua action butuh auth
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON body');
  }

  const { action, order, orders } = body;
  if (!action) return err('Missing action');

  const formData = new URLSearchParams();
  formData.append('key', PROVIDER_KEY);
  formData.append('action', action);

  if (action === 'status' && order) {
    formData.append('order', String(order));
  }
  if (action === 'status' && orders) {
    formData.append('orders', Array.isArray(orders) ? orders.join(',') : String(orders));
  }

  let provRes, data;
  try {
    provRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!provRes.ok) return err('Provider error: HTTP ' + provRes.status, 502);
    data = await provRes.json();
  } catch (e) {
    return err('Gagal menghubungi provider: ' + e.message, 502);
  }

  // Jika error dari AsokaPanel
  if (data && data.error) {
    return err('Provider: ' + data.error, 422);
  }

  // Untuk action "services": ambil dari tabel lokal (bukan langsung dari provider)
  // Hanya service yang is_active=1 yang ditampilkan
  if (action === 'services') {
    const result = await env.DB.prepare(
      'SELECT * FROM services WHERE is_active=1 ORDER BY category ASC, name ASC'
    ).all();
    const localServices = result.results || [];
    // Format agar kompatibel dengan frontend
    const formatted = localServices.map(s => ({
      service: s.service_id,
      name: s.name,
      category: s.category,
      rate: s.rate,        // sudah dalam IDR, admin yang set
      rate_idr: s.rate,
      min: s.min_order,
      max: s.max_order,
    }));
    return json(formatted);
  }

  // Sync status order ke D1
  if (action === 'status' && order && data && data.status && env.DB) {
    try {
      await env.DB.prepare(
        `UPDATE orders SET status=?, start_count=?, remains=?, updated_at=datetime('now')
         WHERE provider_order_id=? AND user_id=?`
      ).bind(
        data.status,
        parseInt(data.start_count) || 0,
        parseInt(data.remains) || 0,
        String(order),
        payload.sub
      ).run();
    } catch (_) { /* non-fatal */ }
  }

  return json(data);
}
