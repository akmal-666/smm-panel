/**
 * functions/api/admin/services.js
 * Admin-only CRUD untuk mengaktifkan/menonaktifkan service dari provider
 *
 * GET    /api/admin/services          - list semua service dari provider + status lokal
 * POST   /api/admin/services          - aktifkan service (simpan ke DB dengan custom rate)
 * PUT    /api/admin/services          - update service yang sudah aktif
 * DELETE /api/admin/services?id=X     - nonaktifkan/hapus service dari DB lokal
 */
import { json, err, cors, requireAuth } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

// Middleware: pastikan user adalah admin
async function requireAdmin(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return null;
  const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(payload.sub).first();
  if (!user || user.role !== 'admin') return null;
  return payload;
}

// GET - list semua services dari DB lokal (yang sudah diaktifkan admin)
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  const result = await env.DB.prepare(
    'SELECT * FROM services ORDER BY category ASC, name ASC'
  ).all();

  return json({ success: true, services: result.results });
}

// POST - aktifkan service baru (tambah ke DB lokal)
export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { service_id, name, category, rate, min_order, max_order, is_active } = body;
  if (!service_id || !name || !category || rate === undefined) {
    return err('Field service_id, name, category, dan rate wajib diisi');
  }
  if (isNaN(parseFloat(rate)) || parseFloat(rate) < 0) return err('Rate tidak valid');

  try {
    await env.DB.prepare(
      `INSERT INTO services (service_id, name, category, rate, min_order, max_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(service_id).trim(),
      name.trim(),
      category.trim(),
      parseFloat(rate),
      parseInt(min_order) || 10,
      parseInt(max_order) || 100000,
      is_active === false || is_active === 0 ? 0 : 1
    ).run();
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return err('Service ID ' + service_id + ' sudah ada, gunakan PUT untuk update');
    }
    return err('Gagal menyimpan: ' + e.message, 500);
  }

  return json({ success: true, message: 'Service berhasil diaktifkan' }, 201);
}

// PUT - update service yang sudah ada di DB lokal
export async function onRequestPut(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { id, service_id, name, category, rate, min_order, max_order, is_active } = body;
  if (!id) return err('Field id wajib diisi');

  const existing = await env.DB.prepare('SELECT * FROM services WHERE id=?').bind(id).first();
  if (!existing) return err('Service tidak ditemukan', 404);

  try {
    await env.DB.prepare(
      `UPDATE services SET
        service_id = ?,
        name       = ?,
        category   = ?,
        rate       = ?,
        min_order  = ?,
        max_order  = ?,
        is_active  = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      String(service_id ?? existing.service_id).trim(),
      (name ?? existing.name).trim(),
      (category ?? existing.category).trim(),
      parseFloat(rate ?? existing.rate),
      parseInt(min_order ?? existing.min_order),
      parseInt(max_order ?? existing.max_order),
      (is_active === false || is_active === 0) ? 0 : 1,
      id
    ).run();
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return err('Service ID sudah digunakan oleh service lain');
    }
    return err('Gagal update: ' + e.message, 500);
  }

  return json({ success: true, message: 'Service berhasil diupdate' });
}

// DELETE - hapus service dari DB lokal
export async function onRequestDelete(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return err('Parameter id wajib diisi');

  const existing = await env.DB.prepare('SELECT id FROM services WHERE id=?').bind(id).first();
  if (!existing) return err('Service tidak ditemukan', 404);

  await env.DB.prepare('DELETE FROM services WHERE id=?').bind(id).run();

  return json({ success: true, message: 'Service berhasil dihapus' });
}
