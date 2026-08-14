import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from './_db.js';

async function listAccounts() {
  const sql = db();
  return await sql.unsafe(`SELECT * FROM accounts ORDER BY sort_order ASC, id ASC`);
}

async function createAccount(p: any) {
  const sql = db();
  const name = String(p?.name ?? '').trim();
  if (!name) throw new Error('Account name is required');
  const rows = await sql.unsafe(
    `INSERT INTO accounts (name, type, starting_balance, active, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      name,
      p.type ?? null,
      p.starting_balance ?? null,
      p.active ?? true,
      p.sort_order ?? 0,
    ]
  );
  return rows[0];
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  if (req.method === 'GET') {
    res.status(200).json(await listAccounts());
    return;
  }

  if (req.method === 'POST') {
    res.status(200).json(await createAccount(req.body));
    return;
  }

  // PUT and DELETE both operate on a single account, identified by ?id=
  const id = Number(req.query.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

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
    // starting_balance may have changed — every trade's capital chain in
    // this account is derived from it, so recompute the whole chain.
    await recalcAccountCapital(sql, id);
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
