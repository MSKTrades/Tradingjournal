import { Candle } from '../data/types';

export type IndicatorPoint = { time: number; value: number };

// Every function here returns points already aligned to a specific candle
// index by convention, documented on each one - ReplayChart relies on that
// offset to know how many indicator points are "visible" for a given
// visibleCount without re-deriving it, so don't change the alignment
// without updating the offset math there too.

// First point sits at candle index (period - 1) - the earliest index with
// enough history behind it to average.
export function computeSMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

// Same alignment as SMA (first point at candle index period - 1) - seeded
// with a plain SMA of the first `period` closes, which is the standard
// convention most charting platforms use to start an EMA off of.
export function computeEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: IndicatorPoint[] = [];
  let seedSum = 0;
  for (let i = 0; i < period; i++) seedSum += candles[i].close;
  let ema = seedSum / period;
  out.push({ time: candles[period - 1].time, value: ema });
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    out.push({ time: candles[i].time, value: ema });
  }
  return out;
}

// Wilder's smoothing (the original/standard RSI formula). First point sits
// at candle index `period` (one later than SMA/EMA) since it needs
// `period` price changes, i.e. period + 1 closes, to produce a first value.
export function computeRSI(candles: Candle[], period = 14): IndicatorPoint[] {
  if (candles.length < period + 1) return [];
  const out: IndicatorPoint[] = [];
  const rsiFrom = (avgGain: number, avgLoss: number) =>
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out.push({ time: candles[period].time, value: rsiFrom(avgGain, avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: rsiFrom(avgGain, avgLoss) });
  }
  return out;
}
