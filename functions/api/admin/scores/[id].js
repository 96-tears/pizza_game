import { json, fail, adminOnly, toInt } from '../../../_lib.js';

// DELETE /api/admin/scores/:id — убрать строку из таблицы (например, с неприличным именем).
export const onRequestDelete = adminOnly(async ({ params, env }) => {
  const id = toInt(params.id, 1, 1e12);
  if (id === null) return fail(400, 'bad_id');
  const r = await env.DB.prepare('DELETE FROM scores WHERE id = ?').bind(id).run();
  return json({ ok: true, deleted: r.meta ? r.meta.changes : 0 });
});
