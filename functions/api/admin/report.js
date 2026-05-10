/**
 * functions/api/admin/report.js
 * GET /api/admin/report?period=today|week|month|year|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Laporan keuangan untuk admin:
 * - Total pemasukan (dari order user)
 * - Total top up (credit ke user)
 * - Total order & breakdown per status
 * - Pemasukan per hari (chart data)
 * - Top user berdasarkan spending
 * - Top service berdasarkan revenue
 */
import { json, err, cors, requireAuth } from '../../_utils.js';

export async function onRequestOptions() { return cors(); }

async function requireAdmin(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return null;
  const user = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(payload.sub).first();
  if (!user || user.role !== 'admin') return null;
  return payload;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAdmin(request, env);
  if (!payload) return err('Forbidden', 403);

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'month';

  // Tentukan rentang tanggal
  let fromDate, toDate;
  const now = new Date();

  if (period === 'custom') {
    fromDate = url.searchParams.get('from') || '';
    toDate = url.searchParams.get('to') || '';
    if (!fromDate || !toDate) return err('Parameter from dan to wajib untuk period=custom');
  } else {
    toDate = now.toISOString().split('T')[0];
    if (period === 'today') {
      fromDate = toDate;
    } else if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      fromDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (period === 'year') {
      fromDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }
  }

  const fromTs = fromDate + 'T00:00:00.000Z';
  const toTs   = toDate   + 'T23:59:59.999Z';

  // SQLite D1 menyimpan datetime('now') dalam format 'YYYY-MM-DD HH:MM:SS' UTC
  // Gunakan DATE() function agar tidak terpengaruh timezone/format timestamp

  // ── 1. Ringkasan utama ──
  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*)                                          AS total_orders,
      COALESCE(SUM(charge), 0)                          AS total_revenue,
      COALESCE(SUM(CASE WHEN status='Completed' THEN charge ELSE 0 END), 0) AS revenue_completed,
      COALESCE(SUM(CASE WHEN status='Pending'   THEN charge ELSE 0 END), 0) AS revenue_pending,
      COALESCE(SUM(CASE WHEN status='Processing' THEN charge ELSE 0 END), 0) AS revenue_processing,
      COALESCE(SUM(CASE WHEN status='Cancelled' THEN charge ELSE 0 END), 0) AS revenue_cancelled,
      COUNT(CASE WHEN status='Completed'  THEN 1 END)  AS orders_completed,
      COUNT(CASE WHEN status='Pending'    THEN 1 END)  AS orders_pending,
      COUNT(CASE WHEN status='Processing' THEN 1 END)  AS orders_processing,
      COUNT(CASE WHEN status='Cancelled'  THEN 1 END)  AS orders_cancelled
    FROM orders
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(fromDate, toDate).first();

  // ── 2. Total top up (credit) dalam periode ──
  const topupSummary = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total_topup, COUNT(*) AS topup_count
    FROM transactions
    WHERE type='credit' AND DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(fromDate, toDate).first();

  // ── 3. Pemasukan per hari (untuk chart) ──
  const dailyRevenue = await env.DB.prepare(`
    SELECT
      DATE(created_at) AS date,
      COUNT(*)          AS order_count,
      COALESCE(SUM(charge), 0) AS revenue
    FROM orders
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).bind(fromDate, toDate).all();

  // ── 4. Top 10 user berdasarkan spending ──
  const topUsers = await env.DB.prepare(`
    SELECT
      u.id, u.name, u.email,
      COUNT(o.id)          AS order_count,
      COALESCE(SUM(o.charge), 0) AS total_spent
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
    GROUP BY u.id
    ORDER BY total_spent DESC
    LIMIT 10
  `).bind(fromDate, toDate).all();

  // ── 5. Top 10 service berdasarkan revenue ──
  const topServices = await env.DB.prepare(`
    SELECT
      service_id,
      service_name,
      COUNT(*)             AS order_count,
      SUM(quantity)        AS total_quantity,
      COALESCE(SUM(charge), 0) AS total_revenue
    FROM orders
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    GROUP BY service_id
    ORDER BY total_revenue DESC
    LIMIT 10
  `).bind(fromDate, toDate).all();

  // ── 6. Jumlah user aktif (pernah order) dalam periode ──
  const activeUsers = await env.DB.prepare(`
    SELECT COUNT(DISTINCT user_id) AS count
    FROM orders
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(fromDate, toDate).first();

  // ── 7. Total saldo semua user (snapshot saat ini) ──
  const balanceSnapshot = await env.DB.prepare(`
    SELECT
      COUNT(*) AS user_count,
      COALESCE(SUM(balance), 0) AS total_balance
    FROM users WHERE role='user'
  `).first();

  return json({
    success: true,
    period: { type: period, from: fromDate, to: toDate },
    summary: {
      ...summary,
      total_topup: topupSummary.total_topup,
      topup_count: topupSummary.topup_count,
      active_users: activeUsers.count,
    },
    daily_revenue: dailyRevenue.results,
    top_users: topUsers.results,
    top_services: topServices.results,
    balance_snapshot: balanceSnapshot,
  });
}
