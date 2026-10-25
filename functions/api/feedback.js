import { GAMES, json, fail, readJson, cleanName, cleanText, isPlayerId, toInt, notifyTelegram } from '../_lib.js';

const CONTEXT_KEYS = ['level', 'score', 'screen', 'touch', 'page', 'lang', 'ua'];

// POST /api/feedback {game?, player_id?, name?, contact?, rating?, message?, context?}
// Сохраняет отзыв в базу и, если настроен бот, пересылает его в Telegram.
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return fail(400, e.message);
  }
  if (!body || typeof body !== 'object') return fail(400, 'bad_json');

  const game = GAMES[body.game] ? body.game : null;
  const pid = isPlayerId(body.player_id) ? body.player_id : null;
  const name = cleanName(body.name, 32);
  const contact = cleanName(body.contact, 100);
  const hasRating = body.rating != null && body.rating !== '';
  const rating = hasRating ? toInt(body.rating, 1, 5) : null;
  if (hasRating && rating === null) return fail(400, 'bad_rating');
  const message = cleanText(body.message, 2000);
  if (!message && rating === null) return fail(400, 'empty');

  const raw = body.context && typeof body.context === 'object' ? body.context : {};
  const ctx = {};
  for (const k of CONTEXT_KEYS) if (raw[k] != null && raw[k] !== '') ctx[k] = cleanText(String(raw[k]), 300);

  const now = Date.now();
  if (pid) {
    const last = await env.DB.prepare('SELECT created_at FROM feedback WHERE player_id = ? ORDER BY created_at DESC LIMIT 1').bind(pid).first('created_at');
    if (last && now - Number(last) < 15000) return fail(429, 'too_fast');
  }
  const r = await env.DB.prepare('INSERT INTO feedback (game, player_id, name, contact, rating, message, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(game, pid, name || null, contact || null, rating, message, JSON.stringify(ctx), now)
    .run();

  const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'без оценки';
  const text =
    '💬 Отзыв · ' + (game ? GAMES[game].title : 'игра') + ' · ' + stars + '\n' +
    'От: ' + (name || 'аноним') + (contact ? ' (' + contact + ')' : '') +
    (ctx.level ? '\nУровень/контракт: ' + ctx.level + (ctx.score ? ', счёт ' + ctx.score : '') : '') +
    (ctx.screen ? '\nЭкран: ' + ctx.screen + (ctx.touch === 'true' ? ', сенсорный' : '') : '') +
    '\n\n' + (message || '(без текста)');
  const sending = notifyTelegram(env, text).catch((e) => console.warn('telegram: ' + e.message));
  if (typeof context.waitUntil === 'function') context.waitUntil(sending);

  return json({ ok: true, id: r.meta ? r.meta.last_row_id : null });
}
