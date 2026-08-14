import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from '../_db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ids: number[] = req.body.ids ?? [];
  if (ids.length === 0) { res.status(200).json({ deleted: 0 }); return; }
  const sql = db();

  const affectedRows = await sql.unsafe(
    'SELECT DISTINCT account_id FROM trades WHERE id = ANY($1::integer[])',
    [ids]
  );
  const affectedAccountIds = affectedRows.map((r: any) => r.account_id);

  await sql.unsafe('DELETE FROM trades WHERE id = ANY($1::integer[])', [ids]);

  for (const accountId of affectedAccountIds) {
    await recalcAccountCapital(sql, accountId);
  }

  res.status(200).json({ deleted: ids.length });
});
