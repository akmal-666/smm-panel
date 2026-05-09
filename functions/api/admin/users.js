/**
 * functions/api/admin/users.js
 * Admin-only user management
 *
 * GET    /api/admin/users          - list semua user
 * POST   /api/admin/users          - buat user baru
 * PUT    /api/admin/users          - update user (reset password / top up saldo)
 * DELETE /api/admin/users?id=X     - hapus user
 */
import { json, err, cors, requireAuth, hashPassword, randomString } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

async function requireAdmin(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return null;
  const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(payload.sub).first();
  if (!user || user.role !== 'admin') return null;
  return payload;
}

// GET - list semua user (kecuali password)
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  const result = await env.DB.prepare(
    `SELECT id, name, email, balance, total_spent, total_orders, role, created_at
     FROM users ORDER BY created_at DESC`
  ).all();

  return json({ success: true, users: result.results });
}

// POST - buat user baru
export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { name, email, password, balance } = body;
  if (!name || !email || !password) return err('Nama, email, dan password wajib diisi');
  if (password.length < 8) return err('Password minimal 8 karakter');

  // Cek email sudah ada
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email.toLowerCase().trim()).first();
  if (existing) return err('Email sudah terdaftar');

  const hashed = await hashPassword(password);
  const apiKey = 'sk_' + randomString(32);
  const referralCode = 'REF' + randomString(6).toUpperCase();

  try {
    await env.DB.prepare(
      `INSERT INTO users (name, email, password, balance, api_key, referral_code, role)
       VALUES (?, ?, ?, ?, ?, ?, 'user')`
    ).bind(
      name.trim(),
      email.toLowerCase().trim(),
      hashed,
      parseFloat(balance) || 0,
      apiKey,
      referralCode
    ).run();
  } catch (e) {
    return err('Gagal membuat user: ' + e.message, 500);
  }

  return json({ success: true, message: 'User berhasil dibuat' }, 201);
}

// PUT - update user (top up saldo / reset password)
export async function onRequestPut(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { id, action, amount, new_password, name } = body;
  if (!id) return err('Field id wajib diisi');

  const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
  if (!user) return err('User tidak ditemukan', 404);

  // Jangan bisa edit admin lain
  if (user.role === 'admin' && user.id !== payload.sub) {
    return err('Tidak bisa mengedit akun admin lain', 403);
  }

  if (action === 'topup') {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return err('Jumlah top up tidak valid');
    await env.DB.prepare(
      `UPDATE users SET balance=balance+?, updated_at=datetime('now') WHERE id=?`
    ).bind(amt, id).run();
    await env.DB.prepare(
      `INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'credit', ?, ?)`
    ).bind(id, amt, 'Top up oleh admin').run();
    return json({ success: true, message: 'Saldo berhasil ditambahkan' });
  }

  if (action === 'reset_password') {
    if (!new_password || new_password.length < 8) return err('Password minimal 8 karakter');
    const hashed = await hashPassword(new_password);
    await env.DB.prepare(
      `UPDATE users SET password=?, updated_at=datetime('now') WHERE id=?`
    ).bind(hashed, id).run();
    return json({ success: true, message: 'Password berhasil direset' });
  }

  if (action === 'update_name' && name) {
    await env.DB.prepare(
      `UPDATE users SET name=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name.trim(), id).run();
    return json({ success: true, message: 'Nama berhasil diupdate' });
  }

  return err('Action tidak dikenal. Gunakan: topup, reset_password, update_name');
}

// DELETE - hapus user
export async function onRequestDelete(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id'));
  if (!id) return err('Parameter id wajib diisi');

  const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(id).first();
  if (!user) return err('User tidak ditemukan', 404);
  if (user.role === 'admin') return err('Tidak bisa menghapus akun admin', 403);
  if (id === payload.sub) return err('Tidak bisa menghapus akun sendiri', 403);

  await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
  return json({ success: true, message: 'User berhasil dihapus' });
}
