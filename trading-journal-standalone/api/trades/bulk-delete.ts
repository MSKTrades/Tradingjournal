import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ids: number[] = req.body.ids ?? [];
  if (ids.length === 0) { res.status(200).json({ deleted: 0 }); return; }
  const sql = db();
  await sql.unsafe('DELETE FROM trades WHERE id = ANY($1::integer[])', [ids]);
  res.status(200).json({ deleted: ids.length });
});
