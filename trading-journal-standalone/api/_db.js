import postgres from 'postgres';

let _sql = null;

export function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = postgres(url, { ssl: 'require' });
  }
  return _sql;
}

// Recomputes the full capital chain for every trade in an account, in
// chronological order, from the account's `starting_balance`. This is the
// single source of truth for start_capital / end_capital / gain_loss /
// gain_loss_pct — none of those are trusted from client input anymore.
// Call this after ANY insert/update/delete of a trade in the account, or
// after the account's starting_balance itself changes. It's a full
// recalculation rather than an incremental patch on purpose: trades can be
// edited or reordered (by trade_number or date) in ways that ripple forward,
// and recomputing the whole chain from a known-good seed is far simpler to
// reason about — and just as correct — as trying to patch only "downstream"
// rows.
export async function recalcAccountCapital(sql, accountId) {
  const acctRows = await sql.unsafe('SELECT starting_balance FROM accounts WHERE id = $1', [accountId]);
  const startingBalance = Number(acctRows[0]?.starting_balance ?? 0);

  const trades = await sql.unsafe(
    `SELECT id, position_size, profit_loss, rr FROM trades
     WHERE account_id = $1
     ORDER BY
       COALESCE(trade_number, 999999) ASC,
       COALESCE(trade_placed_at, created_at::date) ASC,
       created_at ASC`,
    [accountId]
  );

  let running = startingBalance;
  for (const t of trades) {
    const startCap = running;
    const dollarRisk = startCap * (Number(t.position_size) || 0) / 100;
    const gainLoss = t.profit_loss === 'Profit' ? dollarRisk * (Number(t.rr) || 0)
                    : t.profit_loss === 'Loss' ? -dollarRisk : 0;
    const gainLossPct = startCap !== 0 ? (gainLoss / startCap * 100) : 0;
    const endCap = startCap + gainLoss;

    await sql.unsafe(
      `UPDATE trades SET start_capital = $1, end_capital = $2, gain_loss = $3, gain_loss_pct = $4 WHERE id = $5`,
      [
        Math.round(startCap * 100) / 100,
        Math.round(endCap * 100) / 100,
        Math.round(gainLoss * 100) / 100,
        Math.round(gainLossPct * 100) / 100,
        t.id,
      ]
    );
    running = endCap;
  }
}

export function withApi(fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal error',
      });
    }
  };
}
