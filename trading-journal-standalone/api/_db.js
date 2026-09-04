import postgres from 'postgres';

let _sql = null;

export function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = postgres(url, {
      ssl: 'require',
      types: {
        // Postgres DATE columns (trade_placed_at, date_closed) would
        // otherwise come back from the `postgres` driver as JS Date objects
        // (its default parser does `new Date(x)` for oid 1082). Once that
        // hits res.json(), JSON.stringify() calls Date#toJSON() and turns
        // "2026-08-14" into a full UTC timestamp string
        // "2026-08-14T00:00:00.000Z" — which then fails <input type="date">'s
        // strict yyyy-MM-dd validation client-side, silently blanking the
        // field even though the value really is set. Overriding just the
        // DATE oid (1082) to return the raw "YYYY-MM-DD" text Postgres sends
        // over the wire sidesteps the round-trip entirely. Deliberately NOT
        // touching 1114/1184 (TIMESTAMP/TIMESTAMPTZ, e.g. created_at) — those
        // aren't bound to any date input and are fine as real Date objects.
        date: {
          from: [1082],
          parse: (x) => x,
        },
      },
    });
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
    `SELECT id, position_size, profit_loss, rr, source, gain_loss AS existing_gain_loss FROM trades
     WHERE account_id = $1
     ORDER BY
       COALESCE(trade_number, 999999) ASC,
       COALESCE(trade_placed_at, created_at::date) ASC,
       created_at ASC`,
    [accountId]
  );

  if (trades.length === 0) return;

  // The chain itself is still computed sequentially in JS (each trade's
  // start_capital depends on the previous trade's end_capital, so this part
  // can't be parallelized) — but the writes no longer are. This used to
  // `await` one UPDATE per trade in the loop below, which meant N sequential
  // round trips to the database; against a remote host like Neon, each
  // round trip carries real network latency, so a 100+ trade account meant
  // 100+ back-to-forth waits stacked up serially — this was the actual
  // cause of the ~1 minute save/delete times. Collecting every trade's
  // computed values into four parallel arrays and writing them in a single
  // UPDATE ... FROM unnest(...) statement turns that into exactly one round
  // trip no matter how many trades the account has.
  let running = startingBalance;
  const ids = [];
  const startCaps = [];
  const endCaps = [];
  const gainLosses = [];
  const gainLossPcts = [];

  for (const t of trades) {
    const startCap = running;
    const dollarRisk = startCap * (Number(t.position_size) || 0) / 100;
    // A Loss used to always be counted as a flat -1x dollarRisk here,
    // ignoring whatever RR was actually entered - so a trade you closed
    // early at -0.6R (or one that slipped past your stop to -1.4R) showed
    // up everywhere as exactly -1R. Now that RR Achieved can be a precise
    // number (typed directly, derived from Partial 1/2, or derived from
    // real $ P/L in the trade panel), a Loss uses that real magnitude
    // instead. It's wrapped in -Math.abs(...) rather than trusting rr's own
    // sign: existing trades logged before this feature typed RR Achieved as
    // an unsigned magnitude on losses too (e.g. "1.5" meaning "I lost
    // 1.5R", not "-1.5") - checked against real data, this is in fact how
    // every existing Loss row here is stored. -Math.abs(...) gives the
    // correct negative dollar result either way, whether rr came in signed
    // (the new $-P/L-derived flow) or unsigned (everything before it). The
    // flat -dollarRisk fallback only kicks in when rr was never filled in
    // at all (rr === null), so a Loss that's never had an RR value keeps
    // computing exactly as it always did.
    const rrVal = t.rr != null ? Number(t.rr) : null;
    // A trade synced from a real MT4/MT5 broker account (source='mt_sync')
    // already carries its real dollar profit/loss straight from the broker
    // (see api/_metaapi.ts's syncAccount, which computes it from the sum of
    // the position's deals) - position_size for those rows isn't "% of
    // capital risked" the way a manually-logged trade's is, it's a lot size
    // in extra_data, so running it through the %-risk formula below would
    // produce a meaningless number. Trust the stored value for those instead
    // of recomputing it - this UPDATE still writes it back below, just
    // unchanged, so the chain (start/end capital) still flows through it
    // correctly. A CSV-imported broker statement (source='csv_import', see
    // ImportTradesDialog.tsx) carries the same kind of real dollar P&L per
    // row rather than a %-risk category, so it gets the identical treatment.
    const gainLoss = (t.source === 'mt_sync' || t.source === 'csv_import') ? Number(t.existing_gain_loss ?? 0)
                    : t.profit_loss === 'Breakeven' ? 0
                    : t.profit_loss === 'Loss' ? (rrVal != null ? -Math.abs(dollarRisk * rrVal) : -dollarRisk)
                    : t.profit_loss === 'Profit' ? dollarRisk * (rrVal ?? 0)
                    : 0;
    const gainLossPct = startCap !== 0 ? (gainLoss / startCap * 100) : 0;
    const endCap = startCap + gainLoss;

    ids.push(t.id);
    startCaps.push(Math.round(startCap * 100) / 100);
    endCaps.push(Math.round(endCap * 100) / 100);
    gainLosses.push(Math.round(gainLoss * 100) / 100);
    gainLossPcts.push(Math.round(gainLossPct * 100) / 100);

    running = endCap;
  }

  await sql.unsafe(
    `UPDATE trades AS t SET
       start_capital = u.start_capital,
       end_capital = u.end_capital,
       gain_loss = u.gain_loss,
       gain_loss_pct = u.gain_loss_pct
     FROM unnest($1::int[], $2::numeric[], $3::numeric[], $4::numeric[], $5::numeric[])
       AS u(id, start_capital, end_capital, gain_loss, gain_loss_pct)
     WHERE t.id = u.id`,
    [ids, startCaps, endCaps, gainLosses, gainLossPcts]
  );
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
      // Full error goes to the server log; the client gets a generic
      // message. Returning err.message directly used to leak internal
      // details (DB error text can include table/column names or query
      // fragments) to anyone who could trigger a 500, which is more useful
      // to an attacker probing the API than to a real user seeing an error.
      console.error(err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}
