/**
 * functions/api/proxy.js
 * POST /api/proxy  - proxy ke AsokaPanel API + sync status order ke D1
 *
 * Actions yang didukung:
 *   - services        : ambil semua service dari provider, merge dengan setting lokal
 *   - services_all    : (admin only) ambil semua service dari provider tanpa filter
 *   - status          : cek status 1 order (param: order)
 *   - status          : cek status banyak order (param: orders = "1,2,3")
 *   - balance         : cek saldo di AsokaPanel
 */
import { json, err, cors, requireAuth, getUsdToIdr } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://asokapanel.com/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY;

  if (!PROVIDER_KEY) {
    return err('Provider API belum dikonfigurasi. Set PROVIDER_API_KEY di environment variables Cloudflare Pages.', 503);
  }

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

  // ── services: ambil dari provider, filter hanya yang diaktifkan admin ──
  if (action === 'services') {
    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', 'services');

    let providerServices = [];
    try {
      const provRes = await fetch(PROVIDER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const raw = await provRes.json();
      providerServices = Array.isArray(raw) ? raw : [];
    } catch (e) {
      return err('Gagal mengambil services dari provider: ' + e.message, 502);
    }

    // Ambil semua service yang diaktifkan admin dari DB lokal
    const localResult = await env.DB.prepare(
      'SELECT * FROM services WHERE is_active=1'
    ).all();
    const localMap = {};
    for (const s of (localResult.results || [])) {
      localMap[String(s.service_id)] = s;
    }

    // Filter: hanya tampilkan service yang ada di localMap
    // Gunakan harga dari DB lokal (override), data lain dari provider
    const kurs = await getUsdToIdr(env);

    const filtered = providerServices
      .filter(s => localMap[String(s.service)])
      .map(s => {
        const local = localMap[String(s.service)];
        const rateUsd = parseFloat(s.rate) || 0;
        return {
          service: s.service,
          name: local.name || s.name,
          category: local.category || s.category,
          rate: local.rate,                          // harga jual IDR (set admin)
          rate_usd: rateUsd,                         // harga asli provider USD/1K
          rate_provider_idr: Math.ceil(rateUsd * kurs), // konversi IDR tanpa markup
          kurs_usd: Math.round(kurs),                // kurs saat ini
          min: local.min_order || parseInt(s.min) || 10,
          max: local.max_order || parseInt(s.max) || 100000,
        };
      });

    return json(filtered);
  }

  // ── services_all: untuk admin — semua service dari provider + status lokal ──
  if (action === 'services_all') {
    // Cek admin
    const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(payload.sub).first();
    if (!user || user.role !== 'admin') return err('Forbidden', 403);

    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', 'services');

    let providerServices = [];
    try {
      const provRes = await fetch(PROVIDER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const raw = await provRes.json();
      providerServices = Array.isArray(raw) ? raw : [];
    } catch (e) {
      return err('Gagal mengambil services dari provider: ' + e.message, 502);
    }

    // Ambil semua setting lokal (aktif maupun tidak)
    const localResult = await env.DB.prepare('SELECT * FROM services').all();
    const localMap = {};
    for (const s of (localResult.results || [])) {
      localMap[String(s.service_id)] = s;
    }

    // Merge: provider data + local override info
    const kurs = await getUsdToIdr(env);
    const markup = parseFloat(env.PRICE_MARKUP) || 2.0;

    const merged = providerServices.map(s => {
      const local = localMap[String(s.service)];
      const rateUsd = parseFloat(s.rate) || 0;
      // rate AsokaPanel = USD per 1000 unit
      // Konversi: rateUsd * kurs = IDR per 1000 unit
      // Bulatkan ke kelipatan 10
      const defaultRate = Math.ceil(rateUsd * kurs / 10) * 10;
      return {
        service: s.service,
        name: s.name,
        category: s.category,
        rate_provider_usd: s.rate,
        rate_default_idr: defaultRate,
        // Data dari DB lokal (jika sudah diaktifkan)
        db_id: local ? local.id : null,
        custom_name: local ? local.name : null,
        custom_category: local ? local.category : null,
        custom_rate: local ? local.rate : null,
        min_order: local ? local.min_order : (parseInt(s.min) || 10),
        max_order: local ? local.max_order : (parseInt(s.max) || 100000),
        is_active: local ? local.is_active : 0,
      };
    });

    return json(merged);
  }

  // ── Untuk action lain (status, balance): forward ke provider ──
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

  if (data && data.error) {
    return err('Provider: ' + data.error, 422);
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
