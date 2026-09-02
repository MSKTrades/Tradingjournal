import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../lib/ui/table';
import { Trade, TagGroup, fmtMoney, plColor } from '../data/types';
import { summarizeOutcome } from '../data/risk';
import { useFetch } from '../../lib/api';
import EmptyBlock from '../../components/EmptyBlock';

// The tag group name the starter preset (TagGroupsPicker.tsx) creates -
// matched exactly against fetched tag_groups to find each tag's color.
// Not the same regex TagGroupsPicker.tsx uses to decide whether to show its
// starter button (that one is deliberately loose, to also catch a group the
// user renamed slightly) - here we want the color lookup for whatever group
// the trade's own "Execution Mistakes" selections actually live under, and
// tag_selections is already keyed by the exact group name, so an exact
// match against that same key is what's needed.
const EXEC_MISTAKE_GROUP_NAME = 'Execution Mistakes';

const FALLBACK_BADGE_CLASS = 'border-border bg-muted text-muted-foreground';

type MistakeRow = ReturnType<typeof summarizeOutcome> & { name: string };

/** Renders on the Summary page - a breakdown of logged Execution Mistake
 * tags (from TagGroupsPicker.tsx's tag_selections, under the "Execution
 * Mistakes" group) cross-referenced against win rate and $ result via the
 * same summarizeOutcome() the other Summary cards use. Tag values are
 * discovered dynamically from whatever actually appears on trades (not
 * hardcoded to the starter preset list) since a user can rename/add/remove
 * options after seeding - same reasoning as PerformanceFilterBar.tsx's
 * accountTagGroups. Purely a client-side derivation of the trades array
 * the Summary page already has in hand; the only extra fetch is tag_groups,
 * used solely to look up each tag's color for its badge. */
export default function ExecutionMistakeSummary({ trades }: { trades: Trade[] }) {
  const { data: rawTagGroups } = useFetch<TagGroup[]>('/columns?resource=tag_groups');
  const tagGroups = rawTagGroups ?? [];
  const matchedGroup = tagGroups.find(g => g.name === EXEC_MISTAKE_GROUP_NAME);

  const rows = useMemo<MistakeRow[]>(() => {
    const names = new Set<string>();
    for (const t of trades) {
      for (const name of t.tag_selections?.[EXEC_MISTAKE_GROUP_NAME] ?? []) names.add(name);
    }
    const result: MistakeRow[] = [];
    for (const name of names) {
      const matched = trades.filter(t => t.tag_selections?.[EXEC_MISTAKE_GROUP_NAME]?.includes(name));
      if (matched.length === 0) continue;
      result.push({ name, ...summarizeOutcome(matched) });
    }
    return result.sort((a, b) => b.count - a.count);
  }, [trades]);

  if (rows.length === 0) {
    return (
      <EmptyBlock
        icon={AlertTriangle}
        title="Execution Mistakes"
        message="Tag a trade with an execution mistake (under the 'Execution Mistakes' tag group) to see how each one lines up with your results."
      />
    );
  }

  function colorFor(name: string): string | null {
    return matchedGroup?.options.find(o => o.name.toLowerCase() === name.toLowerCase())?.color ?? null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">Execution Mistakes</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          How trades tagged with each logged execution mistake line up with results.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="h-7 px-2 text-[11px]">Tag</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Trades</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Wins</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Losses</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Win %</TableHead>
                <TableHead className="h-7 px-2 text-[11px] text-right">Net $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const color = colorFor(row.name);
                return (
                  <TableRow key={row.name}>
                    <TableCell className="p-2 whitespace-nowrap">
                      {color ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium border"
                          style={{ backgroundColor: `${color}25`, color, borderColor: `${color}55` }}
                        >
                          {row.name}
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${FALLBACK_BADGE_CLASS}`}>
                          {row.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="p-2 text-right">{row.count}</TableCell>
                    <TableCell className="p-2 text-right">{row.wins}</TableCell>
                    <TableCell className="p-2 text-right">{row.losses}</TableCell>
                    <TableCell className="p-2 text-right">{row.winRate === null ? '—' : `${row.winRate}%`}</TableCell>
                    <TableCell className={`p-2 text-right font-mono font-medium ${plColor(row.totalGL)}`}>
                      {fmtMoney(row.totalGL)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
