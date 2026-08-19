import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from './_db.js';
import { requireUserId } from './_auth.js';

async function listAccounts(sql: ReturnType<typeof db>, userId: number) {
  return await sql.unsafe(`SELECT * FROM accounts WHERE user_id = $1 ORDER BY sort_order ASC, id ASC`, [userId]);
}

async function createAccount(sql: ReturnType<typeof db>, userId: number, p: any) {
  const name = String(p?.name ?? '').trim();
  if (!name) throw new Error('Account name is required');
  const rows = await sql.unsafe(
    `INSERT INTO accounts (name, type, starting_balance, active, sort_order, daily_loss_limit_pct, max_drawdown_limit_pct, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      p.type ?? null,
      p.starting_balance ?? null,
      p.active ?? true,
      p.sort_order ?? 0,
      p.daily_loss_limit_pct ?? null,
      p.max_drawdown_limit_pct ?? null,
      userId,
    ]
  );
  return rows[0];
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  if (req.method === 'GET') {
    res.status(200).json(await listAccounts(sql, userId));
    return;
  }

  if (req.method === 'POST') {
    res.status(200).json(await createAccount(sql, userId, req.body));
    return;
  }

  // PUT and DELETE both operate on a single account, identified by ?id= —
  // every query below is scoped WHERE ... AND user_id = $userId, not just
  // WHERE id = $id, so an id that belongs to someone else's account behaves
  // exactly like an id that doesn't exist at all (404), instead of silently
  // operating on it.
  const id = Number(req.query.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

  if (req.method === 'PUT') {
    const p = req.body;
    const name = String(p?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'Account name is required' }); return; }

    const rows = await sql.unsafe(
      `UPDATE accounts SET
        name = $1, type = $2, starting_balance = $3, active = $4, sort_order = $5,
        daily_loss_limit_pct = $6, max_drawdown_limit_pct = $7
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        name, p.type ?? null, p.starting_balance ?? null, p.active ?? true, p.sort_order ?? 0,
        p.daily_loss_limit_pct ?? null, p.max_drawdown_limit_pct ?? null, id, userId,
      ]
    );

    if (!rows[0]) { res.status(404).json({ error: 'Account not found' }); return; }
    // starting_balance may have changed — every trade's capital chain in
    // this account is derived from it, so recompute the whole chain.
    await recalcAccountCapital(sql, id);
    res.status(200).json(rows[0]);
  } else if (req.method === 'DELETE') {
    const ownRows = await sql.unsafe('SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!ownRows[0]) { res.status(404).json({ error: 'Account not found' }); return; }

    const tradeCountRows = await sql.unsafe('SELECT COUNT(*)::int AS count FROM trades WHERE account_id = $1', [id]);
    const tradeCount = tradeCountRows[0]?.count ?? 0;
    if (tradeCount > 0) {
      res.status(400).json({
        error: `This account still has ${tradeCount} trade${tradeCount === 1 ? '' : 's'}. Delete or move them before deleting the account.`,
      });
      return;
    }

    // "Last remaining account" is checked per-user, not globally — another
    // user having exactly one account of their own shouldn't block this
    // user from deleting theirs, and vice versa.
    const accountCountRows = await sql.unsafe('SELECT COUNT(*)::int AS count FROM accounts WHERE user_id = $1', [userId]);
    if ((accountCountRows[0]?.count ?? 0) <= 1) {
      res.status(400).json({ error: 'Cannot delete the last remaining account.' });
      return;
    }

    await sql.unsafe('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
