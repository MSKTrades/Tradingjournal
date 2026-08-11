import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db';

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sql = db();
  const trades: any[] = await sql.unsafe(
    `SELECT trade_placed_at, profit_loss, gain_loss, start_capital, end_capital,
            reached_1r2, reached_1r3
     FROM trades
     WHERE trade_placed_at IS NOT NULL
     ORDER BY trade_placed_at ASC, COALESCE(trade_number, 999999) ASC, created_at ASC`
  );

  function isWin(t: any): boolean {
    if (t.profit_loss === 'Profit') return true;
    if (t.profit_loss === 'Loss') return false;
    return Number(t.gain_loss ?? 0) > 0;
  }
  function isLoss(t: any): boolean {
    if (t.profit_loss === 'Loss') return true;
    if (t.profit_loss === 'Profit') return false;
    return Number(t.gain_loss ?? 0) < 0;
  }

  function aggregate(key: (t: any) => string) {
    const map = new Map<string, any[]>();
    for (const t of trades) {
      const k = key(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return Array.from(map.entries()).map(([period, ts]) => {
      const totalGain = ts.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const startCap  = Number(ts[0]?.start_capital ?? 0);
      const endCap    = Number(ts[ts.length - 1]?.end_capital ?? startCap + totalGain);
      const wins   = ts.filter(isWin).length;
      const losses = ts.filter(isLoss).length;
      const total  = ts.length;
      const grossWin  = ts.filter(isWin).reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const grossLoss = -ts.filter(isLoss).reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0);
      return {
        period, total_trades: total, wins, losses,
        win_rate: total > 0 ? Math.round(wins / total * 100) : 0,
        total_gain: Math.round(totalGain * 100) / 100,
        pct_return: startCap > 0 ? Math.round(totalGain / startCap * 10000) / 100 : 0,
        start_capital: Math.round(startCap * 100) / 100,
        end_capital: Math.round(endCap * 100) / 100,
        profit_factor: profitFactor,
      };
    });
  }

  const toYYYYMM = (t: any) => (t.trade_placed_at ?? '').toString().substring(0, 7);
  const toYYYY   = (t: any) => (t.trade_placed_at ?? '').toString().substring(0, 4);
  const toWeekday = (t: any) => WEEKDAY_NAMES[new Date(t.trade_placed_at).getDay()] ?? 'Unknown';

  const weekdayRows = aggregate(toWeekday);
  const weekdaySorted = WEEKDAY_ORDER.map(name => weekdayRows.find(r => r.period === name)).filter(Boolean);

  res.status(200).json({
    monthly: aggregate(toYYYYMM),
    yearly: aggregate(toYYYY),
    weekday: weekdaySorted,
  });
});
