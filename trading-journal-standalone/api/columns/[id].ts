import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sql = db();
  const id = Number(req.query.id);
  await sql.unsafe('DELETE FROM custom_columns WHERE id = $1', [id]);
  res.status(200).json({ deleted: 1 });
});
