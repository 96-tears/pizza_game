import { json, adminOnly, toInt } from '../../_lib.js';

// GET /api/admin/feedback?limit=200 — последние отзывы. Нужен заголовок Authorization: Bearer <ADMIN_KEY>.
export const onRequestGet = adminOnly(async ({ request, env }) => {
  const url = new URL(request.url);
  const limit = toInt(url.searchParams.get('limit') || 200, 1, 1000) || 200;
  const { results } = await env.DB.prepare(
    'SELECT id, game, player_id, name, contact, rating, message, context, created_at FROM feedback ORDER BY created_at DESC LIMIT ?',
  )
    .bind(limit)
    .all();
  const items = results.map((r) => {
    let context = null;
    try {
      context = r.context ? JSON.parse(r.context) : null;
    } catch {
      context = null;
    }
    return { ...r, context };
  });
  return json({ ok: true, items });
});
