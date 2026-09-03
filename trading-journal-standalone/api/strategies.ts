import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from './_db.js';
import { getUserFromRequest, isAdminEmail } from './_auth.js';

// Turns a Playbook title into a URL-safe slug ("London Reversal (GBPUSD)"
// -> "london-reversal-gbpusd"). Collisions are resolved by the caller
// (handlePublishPlaybook below) by appending -2, -3, ... until one is free
// - this just does the base normalization.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'playbook';
}

// Publishing/unpublishing is admin-only for now (see isAdminEmail in
// api/_auth.js) - with a near-empty user base, an open "anyone can publish"
// marketplace would just mean a library with one or two low-effort entries,
// same reasoning TradeZella's own playbook email used a single curated
// strategy rather than an open feed. Every column this writes to is already
// scoped per-strategy (see schema.sql), so opening this up later is a
// permission check change here, not a schema change.
//
// 404 (not 401/403) for a non-admin, same convention as api/backtest.ts's
// SMC_ONLY_RESOURCES and api/columns.ts's admin_stats - a non-admin request
// can't even tell this action exists.
async function handlePublishPlaybook(
  req: VercelRequest,
  res: VercelResponse,
  sql: ReturnType<typeof db>,
  userId: number,
  strategyId: number
) {
  const p = req.body ?? {};
  const title = String(p.title ?? '').trim();
  if (!title) { res.status(400).json({ error: 'title is required' }); return; }
  const description = p.description != null && String(p.description).trim() ? String(p.description).trim() : null;

  const baseSlug = slugify(p.slug && String(p.slug).trim() ? String(p.slug) : title);
  let slug = baseSlug;
  for (let n = 2; n < 50; n++) {
    const clash = await sql.unsafe('SELECT id FROM strategies WHERE playbook_slug = $1 AND id != $2', [slug, strategyId]);
    if (clash.length === 0) break;
    slug = `${baseSlug}-${n}`;
  }

  const rows = await sql.unsafe(
    `UPDATE strategies SET
       playbook_published = true, playbook_title = $1, playbook_slug = $2,
       playbook_description = $3, playbook_published_at = now()
     WHERE id = $4 AND user_id = $5
     RETURNING id, playbook_slug`,
    [title, slug, description, strategyId, userId]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Strategy not found' }); return; }
  res.status(200).json(rows[0]);
}

async function handleUnpublishPlaybook(
  res: VercelResponse,
  sql: ReturnType<typeof db>,
  userId: number,
  strategyId: number
) {
  const rows = await sql.unsafe(
    'UPDATE strategies SET playbook_published = false WHERE id = $1 AND user_id = $2 RETURNING id',
    [strategyId, userId]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Strategy not found' }); return; }
  res.status(200).json({ unpublished: 1 });
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const requester = await getUserFromRequest(req, sql);
  if (!requester) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const userId = requester.id;

  // resource=playbook is checked before the normal GET/POST/PUT/DELETE
  // routing below, same `?resource=` branching convention used across
  // api/accounts.ts and api/backtest.ts to add actions to an existing
  // endpoint without a new serverless function - this project is already at
  // exactly 12 of the Vercel Hobby plan's 12-function cap.
  if (req.query.resource === 'playbook') {
    if (!isAdminEmail(requester.email)) { res.status(404).json({ error: 'Not found' }); return; }
    const strategyId = Number(req.query.id);
    if (!strategyId || isNaN(strategyId)) { res.status(400).json({ error: 'id is required' }); return; }
    if (req.method === 'POST') { await handlePublishPlaybook(req, res, sql, userId, strategyId); return; }
    if (req.method === 'DELETE') { await handleUnpublishPlaybook(res, sql, userId, strategyId); return; }
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.method === 'GET') {
    const rows = await sql.unsafe('SELECT * FROM strategies WHERE user_id = $1 ORDER BY sort_order ASC, id ASC', [userId]);
    const normalized = rows.map((s: any) => ({
      ...s,
      conditions: typeof s.conditions === 'string' ? JSON.parse(s.conditions || '[]') : s.conditions ?? [],
      days: typeof s.days === 'string' ? JSON.parse(s.days || '[]') : s.days ?? [],
      account_ids: typeof s.account_ids === 'string' ? JSON.parse(s.account_ids || '[]') : s.account_ids ?? [],
      time_start: s.time_start ?? null,
      time_end: s.time_end ?? null,
    }));
    res.status(200).json(normalized);
    return;
  }

  if (req.method === 'POST') {
    const p = req.body;
    const rows = await sql.unsafe(
      `INSERT INTO strategies
         (name, conditions, days, time_start, time_end, tp1_rr, tp2_rr, split_percent, sort_order, active, account_ids, user_id)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       RETURNING id`,
      [
        p.name,
        // Raw values, not JSON.stringify()'d — see api/trades/index.ts for
        // why pre-stringifying a value bound to a `::jsonb` cast
        // double-encodes it (the driver serializes it a second time).
        p.conditions ?? [],
        p.days ?? [],
        p.time_start ?? null,
        p.time_end ?? null,
        p.tp1_rr,
        p.tp2_rr ?? null,
        p.split_percent ?? null,
        p.sort_order ?? 0,
        p.active ?? true,
        p.account_ids ?? [],
        userId,
      ]
    );
    res.status(200).json(rows[0]);
    return;
  }

  // PUT and DELETE both operate on a single strategy, identified by ?id= —
  // scoped WHERE ... AND user_id = $userId so an id that belongs to someone
  // else's strategy behaves like it doesn't exist (0 rows affected), not
  // like it was found and quietly edited/removed.
  const id = Number(req.query.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

  if (req.method === 'PUT') {
    const p = req.body;
    const rows = await sql.unsafe(
      `UPDATE strategies SET
         name = $1, conditions = $2::jsonb, days = $3::jsonb,
         time_start = $4, time_end = $5,
         tp1_rr = $6, tp2_rr = $7, split_percent = $8, active = $9, sort_order = $10,
         account_ids = $11::jsonb
       WHERE id = $12 AND user_id = $13
       RETURNING id`,
      [
        p.name,
        p.conditions ?? [],
        p.days ?? [],
        p.time_start ?? null,
        p.time_end ?? null,
        p.tp1_rr,
        p.tp2_rr ?? null,
        p.split_percent ?? null,
        p.active ?? true,
        p.sort_order ?? 0,
        p.account_ids ?? [],
        id,
        userId,
      ]
    );
    if (!rows[0]) { res.status(404).json({ error: 'Strategy not found' }); return; }
    res.status(200).json({ id });
  } else if (req.method === 'DELETE') {
    await sql.unsafe('DELETE FROM strategies WHERE id = $1 AND user_id = $2', [id, userId]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
