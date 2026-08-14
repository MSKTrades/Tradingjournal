import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db.js';

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
  if (req.method === 'GET') {
    res.status(200).json(await listAccounts());
  } else if (req.method === 'POST') {
    res.status(200).json(await createAccount(req.body));
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
