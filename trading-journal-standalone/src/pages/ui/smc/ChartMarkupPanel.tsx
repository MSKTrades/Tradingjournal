import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { ImagePlus, Loader2, Trash2, ZoomIn, X } from 'lucide-react';
import { Card, CardContent } from '../../../lib/ui/card';
import { Button } from '../../../lib/ui/button';
import { Badge } from '../../../lib/ui/form';
import { api, useFetch } from '../../../lib/api';
import { SmcChartMarkup, SmcTimeframe, TimeframeAnalysis } from './types';

type Props = {
  pair: string;
  tf: SmcTimeframe;
  analysis: TimeframeAnalysis | undefined;
};

const BIAS_STYLE: Record<string, string> = {
  bullish: 'bg-green-500/15 text-green-600 dark:text-green-400',
  bearish: 'bg-red-500/15 text-red-600 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
  unclear: 'bg-muted text-muted-foreground',
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-green-500/15 text-green-600 dark:text-green-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
};

// Compact summary of the live analysis for this timeframe - sent alongside
// the uploaded image so the AI's read gets cross-checked against real
// numbers instead of guessing prices from the picture's own axis labels.
// Deliberately small (not the full candle array): this is a JSON body going
// straight into an LLM prompt, and it only needs the "current state"
// snapshot, not history.
function buildLiveContext(analysis: TimeframeAnalysis | undefined) {
  if (!analysis) return null;
  return {
    trend: analysis.trend,
    range: analysis.range,
    position: analysis.position,
    orderBlocks: analysis.orderBlocks.filter(o => !o.mitigated).map(o => ({ direction: o.direction, high: o.high, low: o.low })),
    fvgs: analysis.fvgs.filter(f => !f.filled).map(f => ({ direction: f.direction, top: f.top, bottom: f.bottom })),
    liquidity: [
      ...analysis.liquidity.eqHighs.filter(l => !l.swept).map(l => ({ kind: l.kind, price: l.price })),
      ...analysis.liquidity.eqLows.filter(l => !l.swept).map(l => ({ kind: l.kind, price: l.price })),
    ],
    lastClose: analysis.lastClose,
  };
}

export default function ChartMarkupPanel({ pair, tf, analysis }: Props) {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: rawMarkups, refetch } = useFetch<SmcChartMarkup[]>(
    `/backtest?resource=smc_chart_markups&pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(tf)}`
  );
  const markups = rawMarkups ?? [];

  async function handleFile(file: File) {
    if (uploading || analyzing) return;
    if (!file.type.startsWith('image/')) { setError('Please upload or paste an image file.'); return; }
    setError(null);
    setUploading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const blob = await upload(file.name || `smc-chart-${Date.now()}.png`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: file.type,
        abortSignal: controller.signal,
      });
      setUploading(false);
      setAnalyzing(true);
      await api.post('/backtest', {
        resource: 'smc_chart_analyze',
        pair,
        timeframe: tf,
        image_url: blob.url,
        liveContext: buildLiveContext(analysis),
      });
      refetch();
    } catch (e: any) {
      if (e?.name === 'AbortError') setError('Upload timed out after 45s. Check that Blob storage is set up for this project.');
      else setError(e.message ?? 'Failed to upload and analyze the chart image.');
    } finally {
      clearTimeout(timeout);
      setUploading(false);
      setAnalyzing(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData.items || []);
    const imageItem = items.find(it => it.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) { e.preventDefault(); handleFile(file); }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleDelete(id: number | string) {
    await api.del(`/backtest?resource=smc_chart_markups&id=${id}`);
    refetch();
  }

  const busy = uploading || analyzing;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold">Chart Markup — AI Read</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste (Ctrl+V) or upload a screenshot of your own chart for this timeframe. An AI vision model gives a
            best-effort visual read and cross-checks it against the live data above — treat it as a rough second
            opinion, not a precise signal; it can't reliably read exact prices off a picture.
          </p>
        </div>

        <div
          ref={dropRef}
          tabIndex={0}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed rounded-lg py-6 px-4 text-center text-xs text-muted-foreground cursor-pointer hover:bg-muted/40 transition-colors flex flex-col items-center gap-2"
        >
          {busy ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {uploading ? 'Uploading…' : 'Analyzing chart…'}</>
          ) : (
            <><ImagePlus className="w-5 h-5" /> Click to browse, drag a file here, or click and press Ctrl+V to paste a screenshot</>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        {markups.length > 0 && (
          <div className="flex flex-col gap-3 mt-1">
            {markups.map(m => (
              <div key={m.id} className="border rounded-lg p-3 flex gap-3">
                <button type="button" onClick={() => setLightbox(m.image_url)} className="relative shrink-0 group">
                  <img src={m.image_url} alt="Chart markup" className="w-20 h-20 object-cover rounded border" />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors rounded">
                    <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                  </span>
                </button>
                <div className="flex-1 text-xs flex flex-col gap-1.5 min-w-0">
                  {m.analysis ? (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={BIAS_STYLE[m.analysis.possible_bias] ?? BIAS_STYLE.unclear}>
                          {m.analysis.possible_bias}
                        </Badge>
                        <Badge className={CONFIDENCE_STYLE[m.analysis.confidence] ?? CONFIDENCE_STYLE.low}>
                          {m.analysis.confidence} confidence
                        </Badge>
                        <span className="text-muted-foreground ml-auto">{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p>{m.analysis.visual_read}</p>
                      {m.analysis.cross_check && <p className="text-muted-foreground italic">{m.analysis.cross_check}</p>}
                      {m.analysis.caveats && <p className="text-muted-foreground">Caveats: {m.analysis.caveats}</p>}
                    </>
                  ) : (
                    <p className="text-muted-foreground">No AI read available for this image.</p>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(m.id)} className="shrink-0 h-6 w-6">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={lightbox} alt="Chart markup" className="max-w-full max-h-full rounded" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Card>
  );
}
