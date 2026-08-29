import { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Trade } from '../data/types';
import ProBadge from '../../components/ProBadge';

// Fixed R-multiple buckets, left-inclusive/right-exclusive except the two
// open-ended tails. `test` is evaluated in order, first match wins, so the
// bucket boundaries below double as the only place that ordering matters.
const BUCKETS: { label: string; test: (r: number) => boolean }[] = [
  { label: '< -1R', test: (r) => r < -1 },
  { label: '-1R to 0R', test: (r) => r >= -1 && r < 0 },
  { label: '0R to 1R', test: (r) => r >= 0 && r < 1 },
  { label: '1R to 2R', test: (r) => r >= 1 && r < 2 },
  { label: '2R to 3R', test: (r) => r >= 2 && r < 3 },
  { label: '3R to 5R', test: (r) => r >= 3 && r < 5 },
  { label: '5R+', test: (r) => r >= 5 },
];

// Losing buckets get a red shade, winning buckets a green shade, intensity
// increasing the further a bucket sits from 0 - the bucket right next to 0
// on each side (the ordinary, unremarkable case) is pinned to the exact
// same red/green Hour-of-Day Performance and the Monthly/Yearly/By-Day/By-
// Session/By-Hour bar charts already use for "loss"/"win" (#ef4444 /
// #16a34a) - previously this chart used its OWN slightly different gradient
// with a lighter #f87171 for "-1R to 0R", which put two different-looking
// reds for "a loss happened" side by side whenever this card and
// Hour-of-Day Performance render next to each other, and read as a color
// bug even though each individual chart's own logic was fine. Anchoring
// both charts' near-zero buckets to the same hex values fixes that, while
// still letting more extreme buckets (a bigger loss, a bigger win) read as
// visually more intense than the everyday case. Index lines up 1:1 with
// BUCKETS above.
const BUCKET_COLORS = ['#b91c1c', '#ef4444', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16'];

type BucketDatum = { label: string; count: number };

function computeBuckets(trades: Trade[]): { data: BucketDatum[]; total: number } {
  const counts = BUCKETS.map(() => 0);
  let total = 0;
  for (const t of trades) {
    if (t.rr == null) continue;
    const r = Number(t.rr);
    if (!isFinite(r)) continue;
    const idx = BUCKETS.findIndex(b => b.test(r));
    if (idx === -1) continue; // shouldn't happen - BUCKETS covers (-inf, inf)
    counts[idx]++;
    total++;
  }
  const data = BUCKETS.map((b, i) => ({ label: b.label, count: counts[i]! }));
  return { data, total };
}

export default function RMultipleDistribution({ trades }: { trades: Trade[] }) {
  const { data, total } = useMemo(() => computeBuckets(trades), [trades]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>R-Multiple Distribution</CardTitle>
          <ProBadge feature="r_multiple_distribution" />
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Not enough closed trades with an R value yet.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} width={30} allowDecimals={false} />
                {/* Default recharts Tooltip cursor is a flat, unstyled gray
                    box spanning the FULL plot height at whatever category
                    you're hovering - normally hidden behind the real bar,
                    but a bucket with 0 trades has no bar to hide it, so
                    hovering an empty bucket showed a full-height gray block
                    that looked like a wrongly-colored/miscounted bar. Toned
                    down to a faint tint instead of removed outright, so
                    hover still gives *some* feedback on empty buckets. */}
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number) => [v, 'Trades']}
                  cursor={{ fill: 'hsl(var(--muted-foreground))', fillOpacity: 0.08 }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {data.map((d, i) => <Cell key={d.label} fill={BUCKET_COLORS[i]} />)}
                  <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
