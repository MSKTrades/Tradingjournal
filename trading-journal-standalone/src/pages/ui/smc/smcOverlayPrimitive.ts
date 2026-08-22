import type {
  IChartApi, ISeriesApi, ISeriesPrimitive, ISeriesPrimitivePaneView, ISeriesPrimitivePaneRenderer,
  SeriesAttachedParameter, Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { OrderBlock, FVG, RangeInfo } from './types';

// Renders the SMC page's AUTO-DETECTED overlays (Order Blocks, FVGs, the
// active dealing range's boundaries, and the 50% equilibrium line) on top of
// a candlestick series - separate from drawingPrimitives.ts's
// DrawingsPrimitive, which renders the user's OWN freeform shapes. Same
// Series Primitives API/pattern (see that file's comments for the
// StrictMode-safety reasoning: everything here is pushed in imperatively via
// setData from an effect, nothing mutates state during render).

type ResolvedBox = { x1: number; x2: number | null; y1: number; y2: number; color: string; alpha: number; dashed: boolean; label: string };
// `width`/`solid` let the trader's own Entry/SL/TP markup (drawn thicker and
// solid, with the price baked into the label) read as clearly distinct from
// the thinner dashed auto-detected Range/EQ lines, even though both are now
// drawn by the same renderer pass - see the primitive class comment below for
// why they have to be.
type ResolvedLine = { y: number; color: string; label: string; width: number; solid: boolean };

class SmcOverlayRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private boxes: ResolvedBox[], private lines: ResolvedLine[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const b of this.boxes) {
        const x2 = b.x2 ?? mediaSize.width;
        const y1 = Math.min(b.y1, b.y2), y2 = Math.max(b.y1, b.y2);
        context.save();
        context.globalAlpha = b.alpha;
        context.fillStyle = b.color;
        context.fillRect(b.x1, y1, x2 - b.x1, y2 - y1);
        context.globalAlpha = 1;
        context.strokeStyle = b.color;
        context.lineWidth = 1;
        context.setLineDash(b.dashed ? [4, 3] : []);
        context.strokeRect(b.x1, y1, x2 - b.x1, y2 - y1);
        if (x2 - b.x1 > 24) {
          context.font = '9px sans-serif';
          context.fillStyle = b.color;
          context.globalAlpha = 0.85;
          context.fillText(b.label, b.x1 + 3, y1 + 10);
        }
        context.restore();
      }
      // Lines are drawn AFTER all the boxes above, in the same canvas pass,
      // so they always paint on top of the OB/FVG shading no matter how
      // dense it is - this is what makes drawing markup lines here (instead
      // of via series.createPriceLine, see SmcChart.tsx) actually reliable.
      for (const l of this.lines) {
        context.save();
        context.strokeStyle = l.color;
        context.setLineDash(l.solid ? [] : [6, 4]);
        context.lineWidth = l.width;
        context.beginPath();
        context.moveTo(0, l.y);
        context.lineTo(mediaSize.width, l.y);
        context.stroke();
        context.font = l.solid ? 'bold 11px sans-serif' : '10px sans-serif';
        context.fillStyle = l.color;
        context.setLineDash([]);
        context.fillText(l.label, 4, l.y - 4);
        context.restore();
      }
    });
  }
}

class SmcOverlayPaneView implements ISeriesPrimitivePaneView {
  constructor(private source: SmcOverlayPrimitive) {}

  // Paints this overlay BEFORE the candles instead of after (the pane-view
  // default is 'normal', i.e. on top), so the auto-detected OB/FVG shading
  // reads as background context behind the candlesticks rather than
  // obscuring them. Note: this does NOT affect the Entry/SL/TP markup lines
  // below - those are drawn by this same renderer's own canvas calls (see
  // SmcOverlayRenderer.draw()), not by native series.createPriceLine(), so
  // they're unaffected by this pane's z-order and always paint after this
  // pane's boxes regardless. (An earlier version of the markup lines DID use
  // series.createPriceLine(), and setting zOrder 'bottom' here alone was not
  // enough to make them visible over a dense overlay - attaching any series
  // primitive to the series appears to break native price-line rendering in
  // this lightweight-charts version, independent of z-order. Drawing the
  // markup lines inside this primitive instead sidesteps that entirely.)
  zOrder(): 'bottom' { return 'bottom'; }

  renderer(): ISeriesPrimitivePaneRenderer | null {
    const { chart, series } = this.source;
    if (!chart || !series) return null;
    const ts = chart.timeScale();
    const { orderBlocks, fvgs, range } = this.source.getData();
    const boxes: ResolvedBox[] = [];

    for (const ob of orderBlocks) {
      const x1 = ts.timeToCoordinate(ob.time as Time);
      const y1 = series.priceToCoordinate(ob.high);
      const y2 = series.priceToCoordinate(ob.low);
      if (x1 == null || y1 == null || y2 == null) continue;
      const x2 = ob.mitigated && ob.mitigatedAt != null ? ts.timeToCoordinate(ob.mitigatedAt as Time) : null;
      boxes.push({
        x1, x2, y1, y2,
        color: ob.direction === 'bullish' ? '#22c55e' : '#ef4444',
        alpha: ob.mitigated ? 0.05 : 0.16, dashed: false, label: ob.mitigated ? 'OB (mitigated)' : 'OB',
      });
    }
    for (const f of fvgs) {
      const x1 = ts.timeToCoordinate(f.time as Time);
      const y1 = series.priceToCoordinate(f.top);
      const y2 = series.priceToCoordinate(f.bottom);
      if (x1 == null || y1 == null || y2 == null) continue;
      const x2 = f.filled && f.filledAt != null ? ts.timeToCoordinate(f.filledAt as Time) : null;
      boxes.push({
        x1, x2, y1, y2,
        color: f.direction === 'bullish' ? '#3b82f6' : '#f97316',
        alpha: f.filled ? 0.04 : 0.11, dashed: true, label: f.filled ? 'FVG (filled)' : 'FVG',
      });
    }

    const lines: ResolvedLine[] = [];
    if (range) {
      const eqY = series.priceToCoordinate(range.eq);
      const hiY = series.priceToCoordinate(range.high);
      const loY = series.priceToCoordinate(range.low);
      if (eqY != null) lines.push({ y: eqY, color: '#a855f7', label: 'EQ 50%', width: 1, solid: false });
      if (hiY != null) lines.push({ y: hiY, color: 'rgba(168,85,247,0.5)', label: 'Range High', width: 1, solid: false });
      if (loY != null) lines.push({ y: loY, color: 'rgba(168,85,247,0.5)', label: 'Range Low', width: 1, solid: false });
    }

    // Trader's own Entry/SL/TP markup, added last so it always paints on top
    // of both the boxes above and the range lines above it - see the class
    // comment on SmcOverlayPrimitive for why this lives here instead of
    // native price lines.
    const markup = this.source.getMarkup();
    const markupSpecs: { price: number | null; color: string; title: string }[] = [
      { price: markup.entry, color: '#3b82f6', title: 'Entry' },
      { price: markup.sl, color: '#ef4444', title: 'SL' },
      { price: markup.tp, color: '#22c55e', title: 'TP' },
    ];
    for (const s of markupSpecs) {
      if (s.price == null || isNaN(s.price)) continue;
      const y = series.priceToCoordinate(s.price);
      if (y == null) continue;
      lines.push({ y, color: s.color, label: `${s.title} ${s.price}`, width: 2, solid: true });
    }

    return new SmcOverlayRenderer(boxes, lines);
  }
}

// Renders auto-detected OB/FVG/Range zones AND the trader's own Entry/SL/TP
// markup lines, all in one series primitive. The markup lines used to be
// drawn separately via series.createPriceLine() (lightweight-charts' native
// mechanism), but that turned out to be unreliable once this primitive is
// attached: with a dense OB/FVG overlay present, native price lines and
// their axis labels stopped rendering entirely, regardless of this pane's
// zOrder. Folding the markup lines into this same primitive's canvas-drawn
// renderer (see SmcOverlayRenderer.draw()) sidesteps that native-price-line
// conflict altogether, since these lines are just more shapes drawn in the
// same draw() call that already reliably renders the Range/EQ lines on top
// of the boxes.
export class SmcOverlayPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private _paneViews: SmcOverlayPaneView[];
  private orderBlocks: OrderBlock[] = [];
  private fvgs: FVG[] = [];
  private range: RangeInfo | null = null;
  private markup: { entry: number | null; sl: number | null; tp: number | null } = { entry: null, sl: null, tp: null };

  constructor() {
    this._paneViews = [new SmcOverlayPaneView(this)];
  }

  paneViews() { return this._paneViews; }
  updateAllViews() {}

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart as unknown as IChartApi;
    this.series = param.series as unknown as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  setData(orderBlocks: OrderBlock[], fvgs: FVG[], range: RangeInfo | null) {
    this.orderBlocks = orderBlocks;
    this.fvgs = fvgs;
    this.range = range;
    this.requestUpdate?.();
  }

  getData() { return { orderBlocks: this.orderBlocks, fvgs: this.fvgs, range: this.range }; }

  setMarkup(entry: number | null, sl: number | null, tp: number | null) {
    this.markup = { entry, sl, tp };
    this.requestUpdate?.();
  }

  getMarkup() { return this.markup; }
}
