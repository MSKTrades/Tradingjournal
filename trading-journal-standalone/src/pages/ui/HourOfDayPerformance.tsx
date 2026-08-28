import { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Trade, fmtMoney } from '../data/types';
import { summarizeOutcome } from '../data/risk';

function fmtHour12(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}${period}`;
}

type HourDatum = {
  hour: number;
  label: string;
  count: number;
  winRate: number; // 0 when undecided (no wins/losses among the group)
  totalGL: number;
};

// Buckets trades by the hour parsed out of `trade_executed_at` ("HH:MM",
// no date/timezone attached - same raw-string parse Performance.tsx's own
// By-Hour tab uses, deliberately not `new Date(...)`). Trades with no
// execution time logged, or an unparseable one, are skipped rather than
// guessed into a bucket. Only hours that actually have at least one trade
// are returned, in hour order.
function computeHourlyStats(trades: Trade[]): HourDatum[] {
  const buckets: Trade[][] = Array.from({ length: 24 }, () => []);
  for (const t of trades) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trade_executed_at ?? '');
    if (!m) continue;
    const h = Number(m[1]);
    if (!isFinite(h) || h < 0 || h > 23) continue;
    buckets[h]!.push(t);
  }
  const out: HourDatum[] = [];
  buckets.forEach((group, h) => {
    if (group.length === 0) return;
    const s = summarizeOutcome(group);
    out.push({
      hour: h,
      label: fmtHour12(h),
      count: s.count,
      winRate: s.winRate ?? 0,
      totalGL: s.totalGL,
    });
  });
  return out;
}

export default function HourOfDayPerformance({ trades }: { trades: Trade[] }) {
  const data = useMemo(() => computeHourlyStats(trades), [trades]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Hour-of-Day Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No trades have an Execution Time logged yet.
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Bar height is win rate for that hour; the label above each bar is net $ for that hour.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-40} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10 }} width={35} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ fontSize: 11 }}
                    formatter={(_v: number, _k: string, item: any) => [
                      `${item.payload.winRate}% win rate (${item.payload.count} trade${item.payload.count !== 1 ? 's' : ''}), ${fmtMoney(item.payload.totalGL)} net`,
                      'Hour',
                    ]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                  <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                    {data.map((d) => (
                      <Cell key={d.hour} fill={d.totalGL >= 0 ? '#16a34a' : '#ef4444'} />
                    ))}
                    <LabelList
                      dataKey="totalGL"
                      position="top"
                      formatter={(v: number) => fmtMoney(v)}
                      style={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
