import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneView,
  ISeriesPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

// A drawing that lives on the price/time plane, not a fixed pixel position -
// this is what makes it survive zoom/pan/timeframe switches. Every type
// currently supported uses exactly two anchor points; a horizontal line
// (only one point really matters) is NOT drawn through this primitive - it
// uses the chart's native `series.createPriceLine`, same as the existing
// entry/SL/TP lines, since that's simpler and free hit-testing/labeling.
export type DrawingPoint = { time: number; price: number };
export type DrawingType = 'trendline' | 'rectangle' | 'fib';

export type Drawing = {
  // A number once the server has assigned an id; a temporary string while a
  // just-finished shape is in flight to the API and hasn't been confirmed
  // yet (see the "pending" handling in ReplayChart).
  id: number | string;
  type: DrawingType;
  points: DrawingPoint[];
  color: string;
};

// The standard retracement levels traders actually look for. 0 and 1 land
// exactly on the two anchor points by construction (see the price formula
// below), so they're included even though they're visually redundant with
// the anchor points themselves - that redundancy is expected and harmless.
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

type ResolvedLine = { kind: 'line'; color: string; selected: boolean; x1: number; y1: number; x2: number; y2: number };
type ResolvedRect = { kind: 'rect'; color: string; selected: boolean; x1: number; y1: number; x2: number; y2: number };
type ResolvedFib = { kind: 'fib'; color: string; selected: boolean; x1: number; x2: number; levels: { y: number; label: string }[] };
type ResolvedItem = ResolvedLine | ResolvedRect | ResolvedFib;

class DrawingsRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private items: ResolvedItem[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context }) => {
      for (const item of this.items) {
        context.save();
        context.strokeStyle = item.color;
        context.fillStyle = item.color;
        context.lineWidth = item.selected ? 2.5 : 1.5;

        if (item.kind === 'line') {
          context.beginPath();
          context.moveTo(item.x1, item.y1);
          context.lineTo(item.x2, item.y2);
          context.stroke();
        } else if (item.kind === 'rect') {
          const x = Math.min(item.x1, item.x2);
          const y = Math.min(item.y1, item.y2);
          const w = Math.abs(item.x2 - item.x1);
          const h = Math.abs(item.y2 - item.y1);
          context.globalAlpha = 0.12;
          context.fillRect(x, y, w, h);
          context.globalAlpha = 1;
          context.strokeRect(x, y, w, h);
        } else {
          context.font = '10px sans-serif';
          context.textBaseline = 'middle';
          for (const level of item.levels) {
            context.beginPath();
            context.moveTo(item.x1, level.y);
            context.lineTo(item.x2, level.y);
            context.stroke();
            context.fillText(level.label, item.x2 + 4, level.y);
          }
        }
        context.restore();
      }
    });
  }
}

class DrawingsPaneView implements ISeriesPrimitivePaneView {
  constructor(private source: DrawingsPrimitive) {}

  renderer(): ISeriesPrimitivePaneRenderer | null {
    const { chart, series } = this.source;
    if (!chart || !series) return null;
    const timeScale = chart.timeScale();
    const items: ResolvedItem[] = [];

    for (const { drawing, selected } of this.source.getAllForRender()) {
      const [a, b] = drawing.points;
      if (!a || !b) continue;
      const x1 = timeScale.timeToCoordinate(a.time as Time);
      const y1 = series.priceToCoordinate(a.price);
      const x2 = timeScale.timeToCoordinate(b.time as Time);
      const y2 = series.priceToCoordinate(b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;

      if (drawing.type === 'fib') {
        const levels = FIB_LEVELS.map(level => {
          const price = a.price + level * (b.price - a.price);
          const y = series.priceToCoordinate(price);
          return y == null ? null : { y: y as number, label: `${(level * 100).toFixed(1)}%` };
        }).filter((x): x is { y: number; label: string } => x != null);
        items.push({ kind: 'fib', color: drawing.color, selected, x1: Math.min(x1, x2), x2: Math.max(x1, x2), levels });
      } else if (drawing.type === 'rectangle') {
        items.push({ kind: 'rect', color: drawing.color, selected, x1, y1, x2, y2 });
      } else {
        items.push({ kind: 'line', color: drawing.color, selected, x1, y1, x2, y2 });
      }
    }
    return new DrawingsRenderer(items);
  }
}

// One primitive instance attached to the candle series for the whole
// component's lifetime; its drawings/preview/selection are pushed in
// imperatively from ReplayChart (via setDrawings/setPreview/setSelected)
// rather than the primitive fetching anything itself - same
// refs-mutated-outside-render pattern already used for price lines/markers
// elsewhere in this file, which keeps it safe under React StrictMode's
// double-invocation (see resample.ts's lesson: nothing here mutates state
// as a side effect of a React render, only from effects/event handlers).
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private _paneViews: DrawingsPaneView[];
  private drawings: Drawing[] = [];
  private preview: Drawing | null = null;
  private selectedId: number | string | null = null;

  constructor() {
    this._paneViews = [new DrawingsPaneView(this)];
  }

  paneViews() {
    return this._paneViews;
  }

  updateAllViews() {
    // No cached per-frame state to refresh - the pane view recomputes pixel
    // coordinates straight from the chart/series on every draw, so there's
    // nothing to do here beyond satisfying the interface.
  }

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

  setDrawings(drawings: Drawing[]) {
    this.drawings = drawings;
    this.requestUpdate?.();
  }

  setPreview(preview: Drawing | null) {
    this.preview = preview;
    this.requestUpdate?.();
  }

  setSelected(id: number | string | null) {
    this.selectedId = id;
    this.requestUpdate?.();
  }

  getAllForRender(): { drawing: Drawing; selected: boolean }[] {
    const items = this.drawings.map(d => ({ drawing: d, selected: d.id === this.selectedId }));
    if (this.preview) items.push({ drawing: this.preview, selected: false });
    return items;
  }
}

// Shared by both the primitive's own hover-cursor hitTest (not implemented -
// selection is handled explicitly by ReplayChart's click handler instead,
// see its comment) and that click handler: distance in pixels from a point
// to a line segment, the basis for "did the user click near this drawing."
export function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
