/**
 * functions/api/proxy.js
 */
import { json, err, cors, requireAuth, getUsdToIdr } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://indosmm.id/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY;
  if (!PROVIDER_KEY) return err('Provider API belum dikonfigurasi', 503);

  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body'); }

  const { action, order, orders } = body;
  if (!action) return err('Missing action');

  async function fetchProvider(params) {
    const fd = new URLSearchParams();
    fd.append('key', PROVIDER_KEY);
    for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
    const res = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString(),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function parseServices(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    if (raw && typeof raw === 'object' && !raw.error) {
      const vals = Object.values(raw).filter(v => v && typeof v === 'object' && v.service);
      if (vals.length) return vals;
    }
    return [];
  }

  if (action === 'services') {
    let providerServices = [];
    try {
      const raw = await fetchProvider({ action: 'services' });
      providerServices = parseServices(raw);
    } catch (e) {
      return err('Gagal mengambil services: ' + e.message, 502);
    }
    const localResult = await env.DB.prepare('SELECT * FROM services WHERE is_active=1').all();
    const localMap = {};
    for (const s of (localResult.results || [])) localMap[String(s.service_id)] = s;
    const kurs = await getUsdToIdr(env);
    const filtered = providerServices
      .filter(s => localMap[String(s.service)])
      .map(s => {
        const local = localMap[String(s.service)];
        const rateRaw = parseFloat(s.rate) || 0;
        const isIdr = rateRaw > 100;
        return {
          service: s.service,
          name: local.name || s.name,
          category: local.category || s.category,
          rate: local.rate,
          rate_usd: isIdr ? null : rateRaw,
          rate_provider_idr: isIdr ? rateRaw : Math.ceil(rateRaw * kurs),
          kurs_usd: Math.round(kurs),
          min: local.min_order || parseInt(s.min) || 10,
          max: local.max_order || parseInt(s.max) || 100000,
        };
      });
    return json(filtered);
  }

  if (action === 'services_all') {
    const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(payload.sub).first();
    if (!user || user.role !== 'admin') return err('Forbidden', 403);
    let providerServices = [];
    let rawResponse = null;
    try {
      rawResponse = await fetchProvider({ action: 'services' });
      providerServices = parseServices(rawResponse);
    } catch (e) {
      return err('Gagal mengambil services: ' + e.message, 502);
    }
    if (!providerServices.length) {
      return json({ debug: true, raw: rawResponse, count: 0, services: [] });
    }
    const localResult = await env.DB.prepare('SELECT * FROM services').all();
    const localMap = {};
    for (const s of (localResult.results || [])) localMap[String(s.service_id)] = s;
    const kurs = await getUsdToIdr(env);
    const merged = providerServices.map(s => {
      const local = localMap[String(s.service)];
      const rateRaw = parseFloat(s.rate) || 0;
      const isIdr = rateRaw > 100;
      const defaultRate = isIdr ? Math.ceil(rateRaw / 10) * 10 : Math.ceil(rateRaw * kurs / 10) * 10;
      return {
        service: s.service,
        name: s.name,
        category: s.category,
        rate_provider_usd: isIdr ? null : s.rate,
        rate_provider_idr: isIdr ? rateRaw : null,
        rate_default_idr: defaultRate,
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

  let data;
  try {
    const params = { action };
    if (action === 'status' && order) params.order = order;
    if (action === 'status' && orders) params.orders = Array.isArray(orders) ? orders.join(',') : String(orders);
    data = await fetchProvider(params);
  } catch (e) {
    return err('Gagal menghubungi provider: ' + e.message, 502);
  }

  if (data && data.error) return err('Provider: ' + data.error, 422);

  if (action === 'balance' && data && data.balance !== undefined) {
    const val = parseFloat(data.balance) || 0;
    const isIdr = val > 1000 || (data.currency || '').toUpperCase() === 'IDR';
    if (isIdr) return json({ balance: String(Math.round(val)), currency: 'IDR' });
    const kurs = await getUsdToIdr(env);
    return json({ balance: String(Math.round(val * kurs)), balance_usd: val.toFixed(4), currency: 'IDR', kurs: Math.round(kurs) });
  }

  if (action === 'status' && env.DB) {
    try {
      if (order && data && data.status) {
        await env.DB.prepare(
          `UPDATE orders SET status=?, start_count=?, remains=?, updated_at=datetime('now') WHERE provider_order_id=? AND user_id=?`
        ).bind(data.status, parseInt(data.start_count) || 0, parseInt(data.remains) || 0, String(order), payload.sub).run();
      }
      if (orders && typeof data === 'object' && !data.status) {
        const updates = [];
        for (const [orderId, info] of Object.entries(data)) {
          if (info && info.status && !info.error) {
            updates.push(env.DB.prepare(
              `UPDATE orders SET status=?, start_count=?, remains=?, updated_at=datetime('now') WHERE provider_order_id=? AND user_id=?`
            ).bind(info.status, parseInt(info.start_count) || 0, parseInt(info.remains) || 0, String(orderId), payload.sub));
          }
        }
        if (updates.length > 0) await env.DB.batch(updates);
      }
    } catch (_) {}
  }

  return json(data);
}
