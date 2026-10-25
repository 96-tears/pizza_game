import { GAMES, json, fail, readJson, cleanName, isPlayerId, toInt, maxScore, topRows, playerRow, countRows } from '../_lib.js';

// GET /api/scores?game=3d&limit=10&player=<id> — верхушка таблицы и место этого игрока.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  if (!GAMES[game]) return fail(400, 'bad_game');
  const limit = toInt(url.searchParams.get('limit') || 10, 1, 50) || 10;
  const pid = url.searchParams.get('player');
  const me = isPlayerId(pid) ? await playerRow(env.DB, game, pid) : null;
  const top = await topRows(env.DB, game, limit, me ? pid : null);
  return json({ ok: true, game, top, me, total: await countRows(env.DB, game) });
}

// POST /api/scores {game, player_id, name, score, level} — записать результат.
// На игрока и игру одна строка: результат заменяется только лучшим, имя обновляется всегда.
const UPSERT =
  'INSERT INTO scores (game, player_id, name, score, level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT (game, player_id) DO UPDATE SET name = excluded.name, ' +
  'score = CASE WHEN excluded.score > scores.score OR (excluded.score = scores.score AND excluded.level > scores.level) THEN excluded.score ELSE scores.score END, ' +
  'level = CASE WHEN excluded.score > scores.score OR (excluded.score = scores.score AND excluded.level > scores.level) THEN excluded.level ELSE scores.level END, ' +
  'updated_at = CASE WHEN excluded.score > scores.score OR (excluded.score = scores.score AND excluded.level > scores.level) THEN excluded.updated_at ELSE scores.updated_at END';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return fail(400, e.message);
  }
  if (!body || typeof body !== 'object') return fail(400, 'bad_json');
  const game = body.game;
  if (!GAMES[game]) return fail(400, 'bad_game');
  const pid = body.player_id;
  if (!isPlayerId(pid)) return fail(400, 'bad_player');
  const name = cleanName(body.name);
  if (!name) return fail(400, 'bad_name');
  const level = toInt(body.level, 1, 999);
  const score = toInt(body.score, 0, 1e9);
  if (level === null || score === null) return fail(400, 'bad_score');
  if (score > maxScore(level)) return fail(400, 'implausible');

  const now = Date.now();
  const prev = await env.DB.prepare('SELECT score, level FROM scores WHERE game = ? AND player_id = ?').bind(game, pid).first();
  const improved = !prev || score > prev.score || (score === prev.score && level > prev.level);
  await env.DB.prepare(UPSERT).bind(game, pid, name, score, level, now, now).run();

  const limit = toInt(body.limit, 1, 50) || 10;
  const me = await playerRow(env.DB, game, pid);
  const top = await topRows(env.DB, game, limit, pid);
  return json({ ok: true, game, improved, me, top, total: await countRows(env.DB, game) });
}
