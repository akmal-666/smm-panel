/**
 * functions/api/tickets.js
 * GET  /api/tickets  - list user tickets
 * POST /api/tickets  - create ticket
 */
import { json, err, cors, requireAuth } from '../_utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const tickets = await env.DB.prepare(
    'SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC'
  ).bind(payload.sub).all();

  return json({ success: true, tickets: tickets.results });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) return err('Unauthorized', 401);

  const { subject, category, message } = await request.json();
  if (!subject || !message) return err('Subject and message are required');

  const result = await env.DB.prepare(
    `INSERT INTO tickets (user_id, subject, category, message) VALUES (?, ?, ?, ?)`
  ).bind(payload.sub, subject.trim(), category || 'Other', message.trim()).run();

  return json({ success: true, ticket_id: result.meta.last_row_id }, 201);
}
