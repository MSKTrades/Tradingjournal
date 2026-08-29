import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { Card, CardContent } from '../../lib/ui/card';

/** The "Trading Sessions" clock — graphical strip of the four major forex
 * sessions across the day (in the viewer's own local time), with a shared
 * "now" marker, an explicit OPEN/CLOSED status pill per session, and a
 * live opens-in/closes-in countdown. Originally lived inline in
 * Summary.tsx; pulled out into its own file so the exact same live widget
 * can also power the public, no-login lead-magnet page at
 * /tools/session-clock (see src/pages/SessionClockTool.tsx) without that
 * public page importing anything from the authenticated app. */

// Commonly-cited approximate UTC anchors for the four major forex sessions.
// These are the round-hour conventions used across most retail trading
// resources (e.g. 8am-5pm UTC for London) - they are NOT adjusted for
// daylight-saving shifts in London/New York/Sydney, which move the "real"
// local-time windows by an hour for part of the year. The countdown math
// below always works off these true UTC instants (so it stays correct
// regardless of the viewer's clock); only the timeline bar's pixel layout
// and labels are re-expressed in the viewer's local time for display.
const SESSIONS_DEF: { name: string; start: number; end: number; color: string; dot: string }[] = [
  { name: 'Sydney',   start: 22, end: 7,  color: 'bg-blue-500',   dot: 'bg-blue-500' },
  { name: 'Tokyo',    start: 0,  end: 9,  color: 'bg-violet-500', dot: 'bg-violet-500' },
  { name: 'London',   start: 8,  end: 17, color: 'bg-orange-500', dot: 'bg-orange-500' },
  { name: 'New York', start: 13, end: 22, color: 'bg-green-500',  dot: 'bg-green-500' },
];

function useLiveNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}

function isSessionActive(start: number, end: number, utcHourFrac: number): boolean {
  return start < end
    ? utcHourFrac >= start && utcHourFrac < end
    : utcHourFrac >= start || utcHourFrac < end; // wraps midnight (Sydney)
}

// The whole forex market - not just one session - is closed for the
// weekend from Friday 22:00 UTC (New York close) until Sunday 22:00 UTC
// (Sydney's weekly open). A per-session, hour-of-day-only check has no way
// to know this - it would happily report Sydney/Tokyo as "OPEN" every
// Saturday just because the clock hour matches their daily window, which
// is exactly the bug: real brokers (FXBook included) show the whole market
// closed on Sat/Sun regardless of what the hour is.
function isForexWeekendClosed(d: Date): boolean {
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  if (day === 6) return true;                 // all of Saturday
  if (day === 5 && hour >= 22) return true;    // Friday from 22:00 UTC
  if (day === 0 && hour < 22) return true;     // Sunday before 22:00 UTC
  return false;
}

// Next UTC clock-hour occurrence of `hour` that is strictly after `now`
// (today if it hasn't happened yet, otherwise tomorrow). This is the real
// instant the session opens/closes, independent of how it's displayed.
function nextOccurrence(hour: number, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Same as nextOccurrence, but keeps stepping a day at a time past the
// weekend closure - so e.g. asking "when does Tokyo next open" on a
// Saturday correctly lands on Monday 00:00 UTC, not Sunday 00:00 UTC
// (which nextOccurrence alone would return, and which is still closed).
function nextSessionOpenInstant(hour: number, now: Date): Date {
  let candidate = nextOccurrence(hour, now);
  let guard = 0;
  while (isForexWeekendClosed(candidate) && guard < 8) {
    candidate = nextOccurrence(hour, candidate);
    guard++;
  }
  return candidate;
}

function fmtCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Graphical strip of the four major sessions across the day (in the
// viewer's own local time), with a shared "now" marker, an explicit
// OPEN/CLOSED status pill per session (so current status doesn't depend on
// reading the countdown text), and a live opens-in/closes-in countdown -
// mirrors the session clocks most trading platforms show on their home
// screen, so it's obvious at a glance whether London/NY overlap (the
// highest-liquidity window) is currently active.
export default function SessionClockWidget() {
  const now = useLiveNow();

  // Real UTC instant - drives the countdown math and the active/inactive
  // determination, so those stay correct no matter how they're displayed.
  const utcHourFrac = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  // Same instant, expressed as the viewer's local wall-clock hour - drives
  // everything the bar actually draws (segment positions, tick labels,
  // the "now" line).
  const localHourFrac = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const offsetHours = -now.getTimezoneOffset() / 60;
  const nowPct = (localHourFrac / 24) * 100;
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const weekendClosed = isForexWeekendClosed(now);

  const sessions = SESSIONS_DEF.map(s => {
    const active = !weekendClosed && isSessionActive(s.start, s.end, utcHourFrac);
    const localStart = mod24(s.start + offsetHours);
    const localEnd = mod24(s.end + offsetHours);
    const segments = localStart < localEnd
      ? [{ left: (localStart / 24) * 100, width: ((localEnd - localStart) / 24) * 100 }]
      : [
          { left: (localStart / 24) * 100, width: ((24 - localStart) / 24) * 100 },
          { left: 0, width: (localEnd / 24) * 100 },
        ];
    const countdownMs = active
      ? nextOccurrence(s.end, now).getTime() - now.getTime()
      : nextSessionOpenInstant(s.start, now).getTime() - now.getTime();
    return { ...s, active, segments, countdownMs };
  });

  const activeNames = sessions.filter(s => s.active).map(s => s.name);
  // The market-wide weekly reopen is exactly Sydney's own weekly open
  // (Sunday 22:00 UTC), so this converges to the same instant either way.
  const weeklyReopen = nextSessionOpenInstant(22, now);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock3 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Trading Sessions</h2>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {weekendClosed ? (
          <>
            <span className="font-medium text-foreground">Forex market closed for the weekend</span>
            {' '}&middot; reopens {weeklyReopen.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            {' '}(in {fmtCountdown(weeklyReopen.getTime() - now.getTime())})
          </>
        ) : activeNames.length > 0 ? (
          <>Active now: <span className="font-medium text-foreground">{activeNames.join(', ')}</span></>
        ) : (
          'No major session currently active'
        )}
        {' '}&middot; times shown in your local time ({tzLabel})
      </p>
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-2 px-0.5">
            <span>00</span><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span>
          </div>
          <div className="relative flex flex-col gap-1.5">
            {sessions.map(s => (
              <div key={s.name} className={`flex items-center gap-3 rounded-md -mx-1.5 px-1.5 py-1 ${s.active ? 'bg-green-500/5' : ''}`}>
                <span className="w-[100px] text-xs font-medium shrink-0 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.dot} ${s.active ? '' : 'opacity-40'}`} />
                  {s.name}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 w-[58px] text-center ${
                  s.active ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'
                }`}>
                  {s.active ? 'OPEN' : 'CLOSED'}
                </span>
                <div className="relative flex-1 h-3 rounded-full bg-muted/40 overflow-hidden">
                  {s.segments.map((seg, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 bottom-0 ${s.color} ${s.active ? 'opacity-90' : 'opacity-30'}`}
                      style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                    />
                  ))}
                </div>
                <span className="w-[110px] text-[11px] text-muted-foreground text-right shrink-0">
                  {s.active ? `closes in ${fmtCountdown(s.countdownMs)}` : `opens in ${fmtCountdown(s.countdownMs)}`}
                </span>
              </div>
            ))}
            {/* One straight "now" line spanning every session row, instead of
                a separate short segment drawn inside each row's bar track.
                The old version looked broken/dashed because each row's bar
                had its own `overflow-hidden` clipping box and the rows were
                separated by gaps/padding, so the line never actually
                connected between rows. This is a single absolutely-positioned
                line over the whole stack instead - the calc() mirrors the
                fixed-width name (100px) + status pill (58px) columns and
                their gaps (3 x 12px) on the left, and the gap + countdown
                column (12px + 110px) on the right, so it lines up exactly
                where each row's bar track starts/ends. */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{ left: `calc(182px + (100% - 304px) * ${nowPct} / 100)` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
