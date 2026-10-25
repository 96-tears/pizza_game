import { GAMES, json, fail, adminOnly, toInt } from '../../_lib.js';

// GET /api/admin/scores?game=3d — вся таблица с id строк и id игроков. Нужен Authorization: Bearer <ADMIN_KEY>.
export const onRequestGet = adminOnly(async ({ request, env }) => {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  if (!GAMES[game]) return fail(400, 'bad_game');
  const limit = toInt(url.searchParams.get('limit') || 500, 1, 5000) || 500;
  const { results } = await env.DB.prepare(
    'SELECT id, player_id, name, score, level, created_at, updated_at FROM scores WHERE game = ? ORDER BY score DESC, level DESC, updated_at ASC LIMIT ?',
  )
    .bind(game, limit)
    .all();
  return json({ ok: true, game, items: results });
});
