import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const id = Number(req.query.id);

  if (req.method === 'PUT') {
    const p = req.body;
    const name = String(p?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'Account name is required' }); return; }

    const rows = await sql.unsafe(
      `UPDATE accounts SET
        name = $1, type = $2, starting_balance = $3, active = $4, sort_order = $5
       WHERE id = $6
       RETURNING *`,
      [name, p.type ?? null, p.starting_balance ?? null, p.active ?? true, p.sort_order ?? 0, id]
    );

    if (!rows[0]) { res.status(404).json({ error: 'Account not found' }); return; }
    res.status(200).json(rows[0]);
  } else if (req.method === 'DELETE') {
    const tradeCountRows = await sql.unsafe('SELECT COUNT(*)::int AS count FROM trades WHERE account_id = $1', [id]);
    const tradeCount = tradeCountRows[0]?.count ?? 0;
    if (tradeCount > 0) {
      res.status(400).json({
        error: `This account still has ${tradeCount} trade${tradeCount === 1 ? '' : 's'}. Delete or move them before deleting the account.`,
      });
      return;
    }

    const accountCountRows = await sql.unsafe('SELECT COUNT(*)::int AS count FROM accounts');
    if ((accountCountRows[0]?.count ?? 0) <= 1) {
      res.status(400).json({ error: 'Cannot delete the last remaining account.' });
      return;
    }

    await sql.unsafe('DELETE FROM accounts WHERE id = $1', [id]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
