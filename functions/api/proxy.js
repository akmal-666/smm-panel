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
import { json, err, cors, requireAuth } from '../_utils.js';

// Kurs USD → IDR (update berkala atau ambil dari env)
const USD_TO_IDR = 16300;

// Markup harga dari provider (30%)
const PRICE_MARKUP = 1.3;

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

  // Untuk action "services": konversi harga USD → IDR + tambah markup
  if (action === 'services' && Array.isArray(data)) {
    const kurs = parseFloat(env.USD_TO_IDR) || USD_TO_IDR;
    const markup = parseFloat(env.PRICE_MARKUP) || PRICE_MARKUP;
    data = data.map(s => ({
      ...s,
      // rate asli dari AsokaPanel dalam USD per 1000
      rate_usd: s.rate,
      // rate yang ditampilkan ke user: IDR per 1000 (sudah markup)
      rate: Math.ceil(parseFloat(s.rate) * kurs * markup / 100) * 100, // bulatkan ke ratusan
    }));
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
