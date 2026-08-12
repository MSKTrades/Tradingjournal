function HeatmapView({ monthly }: { monthly: PeriodRow[] }) {
  // Extract unique years from the 'YYYY-MM' period strings properly
  const years = Array.from(new Set(monthly.map(m => {
    if (m.period && m.period.includes('-')) {
      return m.period.split('-')[0];
    }
    return null;
  }))).filter((yr): yr is string => Boolean(yr)).sort().reverse();

  if (years.length === 0) return <div className="p-8 text-center text-muted-foreground">No monthly data available for heatmap.</div>;

  return (
    <div className="overflow-x-auto p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-sm font-bold">Performance by month</h3>
      </div>
      <table className="w-full border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-16"></th>
            {MONTH_NAMES.map(m => (
              <th key={m} className="p-2 bg-muted/40 text-xs font-semibold rounded-md w-16 text-center">{m}</th>
            ))}
            <th className="p-2 bg-muted/40 text-xs font-semibold rounded-md w-20 text-center">YTD</th>
          </tr>
        </thead>
        <tbody>
          {years.map(yr => {
            let ytdTotal = 0;
            return (
              <tr key={yr}>
                <td className="p-2 font-bold text-sm text-center border border-border rounded-md">{yr}</td>
                {MONTH_NAMES.map((_, i) => {
                  const moString = (i + 1).toString().padStart(2, '0');
                  const targetPeriod = `${yr}-${moString}`;
                  const match = monthly.find(m => m.period === targetPeriod);
                  if (!match) return <td key={i} className="p-2 bg-muted/10 rounded-md text-center text-muted-foreground text-xs font-mono">-</td>;
                  
                  ytdTotal += match.pct_return;
                  const isPos = match.pct_return > 0;
                  const isNeg = match.pct_return < 0;
                  return (
                    <td key={i} className={`p-2 rounded-md text-center text-xs font-mono font-medium ${isPos ? 'bg-green-500/10 text-green-500' : isNeg ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground'}`}>
                      {isPos ? '+' : ''}{match.pct_return.toFixed(2)}%
                    </td>
                  );
                })}
                <td className={`p-2 rounded-md text-center text-sm font-bold font-mono border border-border ${ytdTotal > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {ytdTotal > 0 ? '+' : ''}{ytdTotal.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
