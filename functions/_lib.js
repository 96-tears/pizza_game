// Общие помощники для API. Обработчики написаны в формате Cloudflare Pages Functions
// (export onRequestGet / onRequestPost ...), а server.js запускает те же модули под Node.

export const GAMES = {
  '3d': { title: 'Мегалюль 3D' },
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function fail(status, error) {
  return json({ ok: false, error }, status);
}

export async function readJson(request, maxChars = 16000) {
  const text = await request.text();
  if (text.length > maxChars) throw new Error('too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('bad_json');
  }
}

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
// Невидимые символы (zero-width, метки направления текста, BOM) перечислены кодами, чтобы файл не зависел от редактора.
const INVISIBLE = new RegExp('[' + String.fromCharCode(0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0xfeff) + ']', 'g');

// Имя: без управляющих символов, один пробел между словами, не длиннее max символов.
export function cleanName(raw, max = 16) {
  if (typeof raw !== 'string') return '';
  const s = raw.normalize('NFC').replace(CONTROL, '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, max).join('').trim();
}

// Текст отзыва: переносы строк сохраняем, лишние пробелы и пустые строки убираем.
export function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  const s = raw.normalize('NFC').replace(CONTROL, '').replace(INVISIBLE, '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return Array.from(s).slice(0, max).join('').trim();
}

export function isPlayerId(s) {
  return typeof s === 'string' && /^[a-z0-9]{8,40}$/i.test(s);
}

export function toInt(v, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

// Потолок правдоподобного результата: заработано за карьеру при `level` выполненных рейсах.
// Даже самый дорогой контракт на самом большом танкере со всеми премиями приносит меньше 80 000 ₽,
// а к таким рейсам игрок приходит через десятки дешёвых. Отсекает только явный мусор вроде 10^9.
export function maxScore(level) {
  return 80000 * (level + 1);
}

export function isAdmin(request, env) {
  const key = env.ADMIN_KEY;
  if (!key) return false;
  const h = request.headers.get('authorization') || '';
  const given = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= given.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

export function adminOnly(handler) {
  return (context) => (isAdmin(context.request, context.env) ? handler(context) : fail(401, 'unauthorized'));
}

// Пересылка сообщения в Telegram, если заданы TG_TOKEN и TG_CHAT.
export async function notifyTelegram(env, text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return false;
  const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT, text, disable_web_page_preview: true }),
  });
  if (!r.ok) console.warn('telegram: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.ok;
}

const ORDER = 'ORDER BY score DESC, level DESC, updated_at ASC';

export async function topRows(DB, game, limit, pid) {
  const { results } = await DB.prepare('SELECT name, score, level, player_id FROM scores WHERE game = ? ' + ORDER + ' LIMIT ?')
    .bind(game, limit)
    .all();
  return results.map((r) => ({ name: r.name, score: r.score, level: r.level, me: !!pid && r.player_id === pid }));
}

export async function playerRow(DB, game, pid) {
  const row = await DB.prepare('SELECT name, score, level, updated_at FROM scores WHERE game = ? AND player_id = ?').bind(game, pid).first();
  if (!row) return null;
  const higher = await DB.prepare(
    'SELECT COUNT(*) AS n FROM scores WHERE game = ? AND (score > ? OR (score = ? AND level > ?) OR (score = ? AND level = ? AND updated_at < ?))',
  )
    .bind(game, row.score, row.score, row.level, row.score, row.level, row.updated_at)
    .first('n');
  return { name: row.name, score: row.score, level: row.level, rank: Number(higher) + 1 };
}

export async function countRows(DB, game) {
  return Number(await DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ?').bind(game).first('n'));
}
