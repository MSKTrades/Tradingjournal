import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from '../_db.js';
import { requireUserId } from '../_auth.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sql = db();
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  const ids: number[] = req.body.ids ?? [];
  if (ids.length === 0) { res.status(200).json({ deleted: 0 }); return; }

  // Only actually delete the ids that belong to this user's own accounts —
  // any id in the list that isn't theirs (a typo, a stale client cache, or
  // someone poking at the API directly) is silently excluded rather than
  // either deleting it anyway or failing the whole batch.
  const ownedRows = await sql.unsafe(
    `SELECT t.id, t.account_id FROM trades t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.id = ANY($1::integer[]) AND a.user_id = $2`,
    [ids, userId]
  );
  const ownedIds = ownedRows.map((r: any) => r.id);
  const affectedAccountIds = [...new Set(ownedRows.map((r: any) => r.account_id))];

  if (ownedIds.length > 0) {
    await sql.unsafe('DELETE FROM trades WHERE id = ANY($1::integer[])', [ownedIds]);
    for (const accountId of affectedAccountIds) {
      await recalcAccountCapital(sql, accountId as number);
    }
  }

  res.status(200).json({ deleted: ownedIds.length });
});
