import { useEffect, useState } from 'react';

export const SPEED_OPTIONS = [
  { label: '0.5x', ms: 1500 },
  { label: '1x', ms: 800 },
  { label: '2x', ms: 400 },
  { label: '4x', ms: 200 },
  { label: '8x', ms: 100 },
];

// Shared play/pause/step/speed engine for anything that reveals a candle
// array one bar at a time - the Practice Backtest tab (candles = a full
// uploaded dataset) and the Trade Replay tab (candles = a small window
// around one real trade) both just hand this whatever array they're
// revealing and get the same controls back, instead of each re-implementing
// the same setTimeout loop.
export function useReplayPlayback(candleCount: number) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);

  useEffect(() => {
    if (!playing) return;
    if (visibleCount >= candleCount) { setPlaying(false); return; }
    const t = setTimeout(() => setVisibleCount(v => Math.min(v + 1, candleCount)), SPEED_OPTIONS[speedIdx].ms);
    return () => clearTimeout(t);
  }, [playing, visibleCount, candleCount, speedIdx]);

  function reset() {
    setPlaying(false);
    setVisibleCount(0);
  }

  return { visibleCount, setVisibleCount, playing, setPlaying, speedIdx, setSpeedIdx, reset };
}
