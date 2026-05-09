/**
 * functions/api/orders.js
 * GET  /api/orders  - list order milik user
 * POST /api/orders  - buat order baru via AsokaPanel
 *
 * Security:
 * - Auth required untuk semua endpoint
 * - Service divalidasi dari DB lokal (tidak bisa order service sembarangan)
 * - Link divalidasi format URL
 * - Quantity dibatasi min/max dari DB
 * - Harga dari DB lokal (tidak bisa dimanipulasi client)
 * - Saldo dicek sebelum order dikirim ke provider
 */
import { json, err, cors, requireAuth, sanitizeString, sanitizeUrl } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

// GET - list orders milik user
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const orders = await env.DB.prepare(
    'SELECT id,provider_order_id,service_id,service_name,link,quantity,charge,start_count,remains,status,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100'
  ).bind(payload.sub).all();

  return json({ success: true, orders: orders.results });
}

// POST - buat order baru
export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON body');
  }

  // ── Input validation ──
  const service_id = sanitizeString(String(body.service_id || ''), 50);
  const service_name = sanitizeString(body.service_name || '', 200);
  const rawLink = body.link || '';
  const quantity = parseInt(body.quantity);

  if (!service_id) return err('service_id wajib diisi');
  if (!rawLink) return err('Link wajib diisi');
  if (!quantity || quantity < 1) return err('Quantity tidak valid');

  // Validasi URL — harus https
  const link = sanitizeUrl(rawLink);
  if (!link) return err('Link tidak valid. Gunakan URL lengkap yang dimulai dengan https://');

  // Validasi: service harus ada di tabel lokal dan aktif
  const localService = await env.DB.prepare(
    'SELECT * FROM services WHERE service_id=? AND is_active=1'
  ).bind(service_id).first();
  if (!localService) return err('Service tidak tersedia atau belum diaktifkan oleh admin', 404);

  if (quantity < localService.min_order) return err('Minimum order untuk service ini adalah ' + localService.min_order);
  if (quantity > localService.max_order) return err('Maximum order untuk service ini adalah ' + localService.max_order);

  // Ambil data user (fresh dari DB, bukan dari JWT)
  const user = await env.DB.prepare(
    'SELECT id,balance FROM users WHERE id=?'
  ).bind(payload.sub).first();
  if (!user) return err('User tidak ditemukan', 404);

  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://asokapanel.com/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY;
  if (!PROVIDER_KEY) return err('Provider API belum dikonfigurasi', 503);

  // Hitung harga dari DB lokal SEBELUM kirim ke provider
  const chargeIdr = Math.ceil((localService.rate * quantity / 1000) / 100) * 100;

  // Cek saldo SEBELUM kirim ke provider (hindari order tanpa saldo)
  if (user.balance < chargeIdr) {
    return err(`Saldo tidak cukup. Dibutuhkan Rp ${chargeIdr.toLocaleString('id-ID')}, saldo kamu Rp ${user.balance.toLocaleString('id-ID')}`);
  }

  // ── Kirim order ke AsokaPanel ──
  let providerOrderId = null;
  let chargeUsd = 0;

  try {
    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', 'add');
    formData.append('service', service_id);
    formData.append('link', link);
    formData.append('quantity', String(quantity));

    const provRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!provRes.ok) return err('Provider tidak merespons', 502);

    const provData = await provRes.json();
    if (provData.error) return err('Provider error: ' + provData.error, 422);
    if (!provData.order) return err('Provider tidak mengembalikan order ID', 502);

    providerOrderId = provData.order;
    chargeUsd = parseFloat(provData.charge || 0);

  } catch (e) {
    return err('Gagal menghubungi provider', 502);
  }

  // Simpan order + potong saldo dalam 1 atomic batch
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (user_id, provider_order_id, service_id, service_name, link, quantity, charge, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`
      ).bind(
        payload.sub,
        String(providerOrderId),
        service_id,
        service_name,
        link,
        quantity,
        chargeIdr
      ),
      env.DB.prepare(
        `UPDATE users SET balance=balance-?, total_spent=total_spent+?, total_orders=total_orders+1,
         updated_at=datetime('now') WHERE id=? AND balance>=?`
      ).bind(chargeIdr, chargeIdr, payload.sub, chargeIdr), // double-check saldo di DB
      env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, description, ref_id)
         VALUES (?, 'debit', ?, ?, ?)`
      ).bind(
        payload.sub,
        chargeIdr,
        'Order #' + providerOrderId + ' - ' + (service_name || 'Service ' + service_id),
        String(providerOrderId)
      ),
    ]);
  } catch (e) {
    console.error('DB batch error:', e.message);
    return err('Gagal menyimpan order', 500);
  }

  return json({
    success: true,
    order: providerOrderId,
    charge: chargeIdr,
    charge_usd: chargeUsd,
  }, 201);
}
