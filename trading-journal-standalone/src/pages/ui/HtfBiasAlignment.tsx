import { useMemo } from 'react';
import { Compass } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../lib/ui/table';
import { Trade, fmtMoney, plColor } from '../data/types';
import { summarizeOutcome } from '../data/risk';

// The tag group name the starter preset (TagGroupsPicker.tsx) creates -
// same exact-match convention as ExecutionMistakeSummary.tsx: tag_selections
// is keyed by the group's exact name, so this only lines up with trades
// tagged under a group named exactly "HTF Bias" (the starter button's
// name). Rename the group and this stops finding it - same known tradeoff
// as the Execution Mistakes card, not solved differently here.
const HTF_BIAS_GROUP_NAME = 'HTF Bias';

const BULLISH_RE = /bullish/i;
const BEARISH_RE = /bearish/i;
const NEUTRAL_RE = /neutral|ranging/i;

type BiasRow = ReturnType<typeof summarizeOutcome> & { label: string };

/** Renders on the Summary page - answers "do I actually do better trading
 * with my own higher-timeframe read, or against it?" by cross-referencing
 * each trade's HTF Bias tag (Bullish/Bearish/Neutral - from the "HTF Bias"
 * starter tag group, TagGroupsPicker.tsx) against that trade's own
 * Long/Short direction. A trade only has a clear alignment reading when it
 * has exactly one of Bullish/Bearish tagged (not both, not neither) - a
 * Neutral/Ranging tag has no directional expectation to align with, so
 * those trades get their own informational row instead of counting as
 * "aligned" or "against." Purely a client-side derivation of the trades
 * array the Summary page already has in hand - no extra fetch needed,
 * unlike ExecutionMistakeSummary which fetches tag_groups for colors; this
 * card doesn't need per-tag colors since it only ever shows its own three
 * fixed buckets. */
export default function HtfBiasAlignment({ trades }: { trades: Trade[] }) {
  const { aligned, against, neutral, untaggedCount } = useMemo(() => {
    const aligned: Trade[] = [];
    const against: Trade[] = [];
    const neutral: Trade[] = [];
    let untagged = 0;

    for (const t of trades) {
      const sel = t.tag_selections?.[HTF_BIAS_GROUP_NAME] ?? [];
      const hasBullish = sel.some(s => BULLISH_RE.test(s));
      const hasBearish = sel.some(s => BEARISH_RE.test(s));
      const hasNeutral = sel.some(s => NEUTRAL_RE.test(s));

      if (hasBullish && !hasBearish) {
        if (t.direction === 'Long') aligned.push(t); else against.push(t);
      } else if (hasBearish && !hasBullish) {
        if (t.direction === 'Short') aligned.push(t); else against.push(t);
      } else if (hasNeutral) {
        neutral.push(t);
      } else {
        // No HTF Bias tag at all, or both Bullish and Bearish selected at
        // once (contradictory) - either way there's no clear reading to
        // score, so it's counted as untagged rather than guessed at.
        untagged++;
      }
    }
    return { aligned, against, neutral, untaggedCount: untagged };
  }, [trades]);

  const taggedCount = aligned.length + against.length + neutral.length;
  if (taggedCount === 0) return null;

  const rows: BiasRow[] = [
    { label: 'With HTF Bias', ...summarizeOutcome(aligned) },
    { label: 'Against HTF Bias', ...summarizeOutcome(against) },
  ];
  if (neutral.length > 0) rows.push({ label: 'Neutral / Ranging', ...summarizeOutcome(neutral) });

  const directionalCount = aligned.length + against.length;
  const alignmentPct = directionalCount > 0 ? Math.round((aligned.length / directionalCount) * 100) : null;
  const alignedWR = aligned.length > 0 ? summarizeOutcome(aligned).winRate : null;
  const againstWR = against.length > 0 ? summarizeOutcome(against).winRate : null;
  const winRateDelta = alignedWR !== null && againstWR !== null ? alignedWR - againstWR : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">HTF Bias Alignment</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {alignmentPct === null
            ? 'How trades taken with your higher-timeframe bias compare to trades taken against it.'
            : winRateDelta === null
              ? `${alignmentPct}% of your directional trades were taken with your own HTF bias.`
              : winRateDelta >= 0
                ? `${alignmentPct}% taken with your HTF bias — win rate runs ${winRateDelta} pts higher there than against it.`
                : `${alignmentPct}% taken with your HTF bias — win rate actually runs ${Math.abs(winRateDelta)} pts higher against it right now.`}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="h-7 px-2 text-[11px]">Bias</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Trades</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Wins</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Losses</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Win %</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Net $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.label}>
                  <TableCell className="p-2 whitespace-nowrap font-medium">{row.label}</TableCell>
                  <TableCell className="p-2 text-right">{row.count}</TableCell>
                  <TableCell className="p-2 text-right">{row.wins}</TableCell>
                  <TableCell className="p-2 text-right">{row.losses}</TableCell>
                  <TableCell className="p-2 text-right">{row.winRate === null ? '—' : `${row.winRate}%`}</TableCell>
                  <TableCell className={`p-2 text-right font-mono font-medium ${plColor(row.totalGL)}`}>
                    {fmtMoney(row.totalGL)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {untaggedCount > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {untaggedCount} trade{untaggedCount === 1 ? '' : 's'} not tagged with an HTF Bias yet — tag Bullish/Bearish/Neutral on a trade to include it here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
