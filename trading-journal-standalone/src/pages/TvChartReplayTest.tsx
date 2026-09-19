import { useMemo, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { Candle, BacktestTrade } from './data/types';
import TradingViewChart from './ui/TradingViewChart';
import { useReplayPlayback, SPEED_OPTIONS } from './ui/useReplayPlayback';

// Step 2 proof page for advanced-charts-integration-plan.md: wires
// TradingViewChart (the Advanced Charts equivalent of ReplayChart.tsx) up
// to PipEcho's real, unmodified useReplayPlayback hook, driving a
// realistic-scale synthetic 1-minute candle series the same shape
// Backtest.tsx would hand it from a real Dukascopy-fetched dataset.
//
// Deliberately public and unrouted from any nav link (same
// "not officially discoverable" property tv-test.html had in step 1) -
// nothing here touches a real account, real API, or the gated /backtest
// route; it exists purely to prove getBars/subscribeBars work correctly
// against PipEcho's actual replay-scrubbing state before this gets wired
// into the real Backtest page as a later step. Safe to leave in place (no
// user data, no writes) or remove once step 2 is confirmed - your call.
//
// Why synthetic data instead of a real uploaded dataset: this environment
// has no PipEcho login credentials, and fetching a real user's dataset
// would mean either asking for those or reaching into their private data -
// neither appropriate here. This generates a dataset at the scale and
// shape a real Dukascopy pull produces (two weeks of 1-minute bars, ~20k
// candles) specifically so the resample/incremental-cache code path (see
// resample.ts's own comment on why that matters at real dataset scale)
// gets exercised the same way it would be for real, not just proven
// correct on a toy handful of bars like tv-test.html's 300-candle demo.
function generateCandles(count: number): Candle[] {
  const out: Candle[] = [];
  let t = Math.floor(Date.now() / 1000) - count * 60;
  let price = 1.085;
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = Math.sin(i / 180) * 0.00003; // a slow session-scale wave, so a 1h/4h zoom-out looks like real structure, not pure noise
    const change = (Math.random() - 0.5) * 0.00025 + drift;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 0.00015;
    const low = Math.min(open, close) - Math.random() * 0.00015;
    out.push({ time: t, open, high, low, close, volume: Math.round(Math.random() * 400) });
    price = close;
    t += 60;
  }
  return out;
}

const CANDLE_COUNT = 20_000; // ~13.9 days of 1-minute bars
const START_INDEX = 500; // enough history behind the start point for a coarser timeframe to look reasonable immediately, same reasoning as Backtest.tsx's DEFAULT_LOOKBACK

// Step 3 proof data: a handful of synthetic trades placed against real
// points on the generated candle series (entry/exit prices taken from the
// actual candle at that index, not made up numbers), covering the three
// cases TradingViewChart's trade-marker sync needs to get right:
//   - a closed Long, fully in the past before replay even starts (index
//     100->300, well under START_INDEX) - proves trades already "placed"
//     before mount show up via the onChartReady-triggered sync, not just
//     ones revealed later by stepping/playing.
//   - a closed Short, same idea (index 450->480, still before START_INDEX)
//     - proves direction-based styling (red/short vs green/long) alongside
//       the Long case above.
//   - an open Long with SL/TP set, entered just after START_INDEX (index
//     520) with no exit - proves a trade getting revealed *during* replay
//     (via the [trades, visibleCount] effect, not the mount-time one)
//     triggers its entry marker, and that the order-line annotations only
//     appear for a trade that's still open.
function generateTrades(candles: Candle[]): BacktestTrade[] {
  const at = (i: number) => candles[i];
  const iso = (i: number) => new Date(at(i).time * 1000).toISOString();
  return [
    {
      id: 1, dataset_id: 1, session_id: null, direction: 'Long',
      entry_price: at(100).close, sl_price: at(100).close - 0.002, tp_price: at(100).close + 0.004,
      entry_time: iso(100), exit_time: iso(300), exit_price: at(300).close,
      result: at(300).close > at(100).close ? 'Profit' : 'Loss', rr: 1.4,
      position_size: null, start_capital: null, end_capital: null, gain_loss: null, gain_loss_pct: null,
      notes: null, tags: [], created_at: iso(100),
    },
    {
      id: 2, dataset_id: 1, session_id: null, direction: 'Short',
      entry_price: at(450).close, sl_price: at(450).close + 0.002, tp_price: at(450).close - 0.004,
      entry_time: iso(450), exit_time: iso(480), exit_price: at(480).close,
      result: at(480).close < at(450).close ? 'Profit' : 'Loss', rr: 0.8,
      position_size: null, start_capital: null, end_capital: null, gain_loss: null, gain_loss_pct: null,
      notes: null, tags: [], created_at: iso(450),
    },
    {
      id: 3, dataset_id: 1, session_id: null, direction: 'Long',
      entry_price: at(520).close, sl_price: at(520).close - 0.0015, tp_price: at(520).close + 0.005,
      entry_time: iso(520), exit_time: null, exit_price: null,
      result: null, rr: null,
      position_size: null, start_capital: null, end_capital: null, gain_loss: null, gain_loss_pct: null,
      notes: null, tags: [], created_at: iso(520),
    },
  ];
}

export default function TvChartReplayTest() {
  const candles = useMemo(() => generateCandles(CANDLE_COUNT), []);
  const trades = useMemo(() => generateTrades(candles), [candles]);
  const { visibleCount, setVisibleCount, playing, setPlaying, speedIdx, setSpeedIdx, reset } = useReplayPlayback(candles.length);
  const [started, setStarted] = useState(false);

  function start() {
    setVisibleCount(START_INDEX);
    setStarted(true);
  }

  function fullReset() {
    setStarted(false);
    reset();
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Advanced Charts - step 2 replay proof</h1>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        {CANDLE_COUNT.toLocaleString()} synthetic 1-minute candles, replayed through the real useReplayPlayback hook into TradingViewChart's custom datafeed. Not linked from anywhere in the app - see this file's header comment.
      </p>

      {!started && (
        <button
          onClick={start}
          style={{ padding: '8px 16px', borderRadius: 6, background: '#111', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Start replay at candle {START_INDEX}
        </button>
      )}

      {started && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setVisibleCount(v => Math.max(1, v - 1))} disabled={visibleCount <= 1} title="Step back">
              <SkipBack size={16} />
            </button>
            <button onClick={() => setPlaying(p => !p)} disabled={visibleCount >= candles.length} title="Play/pause">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={() => setVisibleCount(v => Math.min(candles.length, v + 1))} disabled={visibleCount >= candles.length} title="Step forward">
              <SkipForward size={16} />
            </button>
            {/* No explicit colors here originally - a native <select> falls
                back to the browser's own (light) control chrome, which on
                PipEcho's dark shell (white ambient text, dark page
                background - see this file's other elements, which all
                inherit that fine) meant white text on the select's own
                white background: invisible. colorScheme: 'dark' also fixes
                the popup option list itself, not just the closed control. */}
            <select
              value={speedIdx}
              onChange={e => setSpeedIdx(Number(e.target.value))}
              style={{ background: '#111', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '2px 4px', colorScheme: 'dark' }}
            >
              {SPEED_OPTIONS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
            </select>
            <button onClick={fullReset} title="Reset">
              <RotateCcw size={16} />
            </button>
            <span id="tv-replay-readout" style={{ fontSize: 12, fontFamily: 'monospace', marginLeft: 8 }}>
              {new Date(candles[Math.max(0, visibleCount - 1)].time * 1000).toISOString()} &middot; {visibleCount.toLocaleString()} / {candles.length.toLocaleString()}
            </span>
          </div>
          <TradingViewChart
            candles={candles}
            visibleCount={visibleCount}
            trades={trades}
            baseTimeframe="1m"
            datasetId={1}
            height={520}
            onReady={() => {
              // Test-only signal (same pattern step 1's tv-test.html used)
              // for an automated check to know the widget has actually
              // finished mounting, not just that this component rendered.
              document.title = 'READY: ' + document.title;
              console.log('CHART_READY');
            }}
          />
        </div>
      )}
    </div>
  );
}
