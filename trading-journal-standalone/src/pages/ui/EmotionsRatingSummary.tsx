import { useMemo } from 'react';
import { Smile, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Trade, fmtMoney } from '../data/types';
import { summarizeOutcome } from '../data/risk';
import { EMOTIONS_POSITIVE, EMOTIONS_CAUTION } from './TradeDetailPanel';

type EmotionGroup = 'positive' | 'caution';

type EmotionRow = ReturnType<typeof summarizeOutcome> & {
  name: string;
  group: EmotionGroup;
  avgRating: number | null;
};

type RatingRow = ReturnType<typeof summarizeOutcome> & {
  rating: number;
};

// Same green/amber convention TradeDetailPanel.tsx's Emotions chips already
// use for these two groups - reused verbatim so a badge like "Confident"
// looks identical whether it's shown in the trade panel or here.
const GROUP_BADGE_CLASS: Record<EmotionGroup, string> = {
  positive: 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300',
  caution: 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

/** Renders on the Summary page - a breakdown of logged Emotions and
 * self-rated Trade Rating (from TradeDetailPanel.tsx), each cross-referenced
 * against win rate and $ result via the same summarizeOutcome() the
 * Checklist Compliance card uses, so "feeling + rating + result" reads as
 * one picture instead of three disconnected lists. Purely a client-side
 * derivation of the trades array the Summary page already has in hand -
 * emotions and trade_rating are already columns on trades and already come
 * back from the existing trades list endpoint. */
export default function EmotionsRatingSummary({ trades }: { trades: Trade[] }) {
  const emotionRows = useMemo<EmotionRow[]>(() => {
    const rows: EmotionRow[] = [];
    const withGroup: { name: string; group: EmotionGroup }[] = [
      ...EMOTIONS_POSITIVE.map(name => ({ name, group: 'positive' as const })),
      ...EMOTIONS_CAUTION.map(name => ({ name, group: 'caution' as const })),
    ];
    for (const { name, group } of withGroup) {
      const matched = trades.filter(t => t.emotions?.includes(name));
      if (matched.length === 0) continue;
      const rated = matched.filter(t => t.trade_rating != null);
      const avgRating = rated.length > 0
        ? Math.round((rated.reduce((s, t) => s + Number(t.trade_rating), 0) / rated.length) * 10) / 10
        : null;
      rows.push({ name, group, avgRating, ...summarizeOutcome(matched) });
    }
    return rows.sort((a, b) => b.count - a.count);
  }, [trades]);

  const ratingRows = useMemo<RatingRow[]>(() => {
    const rows: RatingRow[] = [];
    for (let rating = 1; rating <= 5; rating++) {
      const matched = trades.filter(t => t.trade_rating === rating);
      if (matched.length === 0) continue;
      rows.push({ rating, ...summarizeOutcome(matched) });
    }
    return rows;
  }, [trades]);

  if (emotionRows.length === 0 && ratingRows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Smile className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">Emotions &amp; Rating</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          How your logged feelings and self-rated execution line up with results.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground font-medium">By Emotion</p>
          {emotionRows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No trades tagged with an emotion yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
              {emotionRows.map(row => (
                <div key={row.name} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${GROUP_BADGE_CLASS[row.group]}`}>
                    {row.name}
                  </span>
                  <span className="text-muted-foreground shrink-0">{row.count}x</span>
                  <span className="text-muted-foreground shrink-0">{row.winRate === null ? '—' : `${row.winRate}%`}</span>
                  <span className={`font-mono font-medium shrink-0 ${row.totalGL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {fmtMoney(row.totalGL)}
                  </span>
                  {row.avgRating != null && (
                    <span className="text-muted-foreground truncate">★{row.avgRating} avg</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground font-medium">By Trade Rating</p>
          {ratingRows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No trades rated yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
              {ratingRows.map(row => (
                <div key={row.rating} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star
                        key={n}
                        className={`w-3 h-3 ${n <= row.rating ? 'fill-yellow-500 text-yellow-500' : 'fill-none text-muted-foreground'}`}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground shrink-0">{row.count}x</span>
                  <span className="text-muted-foreground shrink-0">{row.winRate === null ? '—' : `${row.winRate}%`}</span>
                  <span className={`font-mono font-medium shrink-0 ${row.totalGL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {fmtMoney(row.totalGL)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
