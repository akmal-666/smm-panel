/**
 * functions/api/orders.js
 * GET  /api/orders  - list order milik user
 * POST /api/orders  - buat order baru via AsokaPanel
 *
 * Catatan harga:
 * - AsokaPanel mengembalikan harga dalam USD
 * - Kita simpan charge dalam IDR (sudah dikonversi + markup)
 * - Balance user juga dalam IDR
 */
import { json, err, cors, requireAuth, getUsdToIdr } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

// GET - list orders milik user
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const orders = await env.DB.prepare(
    'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100'
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

  const { service_id, service_name, link, quantity } = body;
  if (!service_id || !link || !quantity) return err('Field service_id, link, dan quantity wajib diisi');
  if (parseInt(quantity) < 1) return err('Quantity tidak valid');

  // Validasi: service harus ada di tabel lokal dan aktif
  const localService = await env.DB.prepare(
    'SELECT * FROM services WHERE service_id=? AND is_active=1'
  ).bind(String(service_id)).first();
  if (!localService) {
    return err('Service tidak tersedia atau belum diaktifkan oleh admin', 404);
  }
  if (parseInt(quantity) < localService.min_order) {
    return err('Minimum order untuk service ini adalah ' + localService.min_order);
  }
  if (parseInt(quantity) > localService.max_order) {
    return err('Maximum order untuk service ini adalah ' + localService.max_order);
  }

  // Ambil data user
  const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(payload.sub).first();
  if (!user) return err('User tidak ditemukan', 404);

  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://asokapanel.com/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY;

  if (!PROVIDER_KEY) {
    return err('Provider API belum dikonfigurasi', 503);
  }

  // ── Kirim order ke AsokaPanel ──
  let providerOrderId = null;
  let chargeUsd = 0;
  let chargeIdr = 0;

  try {
    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', 'add');
    formData.append('service', String(service_id));
    formData.append('link', link);
    formData.append('quantity', String(quantity));

    const provRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const provData = await provRes.json();

    // AsokaPanel mengembalikan { order: 123, error: "..." }
    if (provData.error) return err('Provider error: ' + provData.error, 422);
    if (!provData.order) return err('Provider tidak mengembalikan order ID', 502);

    providerOrderId = provData.order;

    // charge dari AsokaPanel dalam USD
    chargeUsd = parseFloat(provData.charge || 0);

    // Harga ke user diambil dari tabel lokal (rate dalam IDR, sudah di-set admin)
    // Bukan dari charge provider — admin yang kontrol harga
    const qty = parseInt(quantity);
    chargeIdr = Math.ceil(localService.rate * qty / 1000 / 100) * 100;

  } catch (e) {
    return err('Gagal menghubungi provider: ' + e.message, 502);
  }

  // Cek saldo (dalam IDR)
  if (user.balance < chargeIdr) {
    return err(`Saldo tidak cukup. Dibutuhkan Rp ${chargeIdr.toLocaleString('id-ID')}, saldo kamu Rp ${user.balance.toLocaleString('id-ID')}`);
  }

  // Simpan order + potong saldo dalam 1 batch
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (user_id, provider_order_id, service_id, service_name, link, quantity, charge, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`
      ).bind(
        payload.sub,
        String(providerOrderId),
        String(service_id),
        service_name || '',
        link,
        parseInt(quantity),
        chargeIdr
      ),

      env.DB.prepare(
        `UPDATE users SET balance=balance-?, total_spent=total_spent+?, total_orders=total_orders+1,
         updated_at=datetime('now') WHERE id=?`
      ).bind(chargeIdr, chargeIdr, payload.sub),

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
    return err('Gagal menyimpan order: ' + e.message, 500);
  }

  return json({
    success: true,
    order: providerOrderId,
    charge: chargeIdr,
    charge_usd: chargeUsd,
  }, 201);
}
