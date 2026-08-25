import { StrategyDiagramSpec } from './strategyInfo';

// A small, self-contained schematic candlestick chart - NOT live data, just
// an illustrative "here's the shape of this pattern" example so a trader
// can see what the model is actually describing before reading the (much
// drier) rule checklist below it. Every strategy card gets one of these,
// built from a hand-authored candle sequence in strategyInfo.ts.
const W = 320, H = 132, PAD_L = 6, PAD_R = 6, PAD_T = 12, PAD_B = 10;

export default function StrategyDiagram({ spec }: { spec: StrategyDiagramSpec }) {
  const { candles, zones = [], markers = [], hLines = [] } = spec;
  const allVals = [...candles.flatMap(c => [c.h, c.l]), ...hLines.map(l => l.value)];
  const minV = Math.min(...allVals) - 4;
  const maxV = Math.max(...allVals) + 4;
  const n = candles.length;
  const usableW = W - PAD_L - PAD_R;
  const step = usableW / n;
  const bodyW = Math.max(2, step * 0.5);

  const x = (i: number) => PAD_L + step * i + step / 2;
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - minV) / (maxV - minV));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto text-muted-foreground" role="img" aria-label="Illustrative example chart for this strategy (not live data)">
      {hLines.map((l, i) => (
        <g key={`hl-${i}`}>
          <line
            x1={x(l.fromIdx) - step / 2} x2={W - PAD_R} y1={y(l.value)} y2={y(l.value)}
            stroke={l.tone === 'sl' ? '#ef4444' : l.tone === 'tp' ? '#22c55e' : 'currentColor'}
            strokeWidth={l.tone === 'eq' ? 0.75 : 1}
            strokeDasharray={l.tone === 'eq' ? '2 2' : '3 2'}
            opacity={l.tone === 'eq' ? 0.5 : 0.8}
          />
          <text x={W - PAD_R - 2} y={y(l.value) - 2} fontSize="6.5" textAnchor="end" fill={l.tone === 'sl' ? '#ef4444' : l.tone === 'tp' ? '#22c55e' : 'currentColor'} opacity={l.tone === 'eq' ? 0.7 : 0.9}>
            {l.label}
          </text>
        </g>
      ))}
      {zones.map((z, i) => (
        <g key={`z-${i}`}>
          <rect
            x={x(z.fromIdx) - step / 2} y={y(z.top)}
            width={(z.toIdx - z.fromIdx + 1) * step} height={Math.max(2, y(z.bottom) - y(z.top))}
            fill={z.tone === 'bull' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}
            stroke={z.tone === 'bull' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}
            strokeWidth={1}
          />
          <text x={x(z.fromIdx) - step / 2 + 2} y={y(z.top) - 2} fontSize="6" fill="currentColor" opacity={0.7}>{z.label}</text>
        </g>
      ))}
      {candles.map((c, i) => {
        const bull = c.c >= c.o;
        const color = bull ? '#22c55e' : '#ef4444';
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyH = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
        return (
          <g key={`c-${i}`}>
            <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1} />
            <rect x={x(i) - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
          </g>
        );
      })}
      {markers.map((m, i) => (
        <g key={`m-${i}`}>
          <circle cx={x(m.idx)} cy={y(m.value)} r={2} fill="currentColor" />
          <text x={x(m.idx)} y={y(m.value) + (m.below ? 11 : -5)} fontSize="6" textAnchor="middle" fill="currentColor" opacity={0.85}>
            {m.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
