import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Loader2, Upload, FileWarning } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select } from '../../lib/ui/form';
import { REPLAY_TIMEFRAMES } from '../data/types';
import { parseCandleFile, ParsedCandles } from '../data/candleParse';

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
};

// Two-step flow: (1) pick a CSV, parse it entirely client-side (candleParse
// tolerates the handful of common export formats) and show a preview so you
// can catch a wrong pair/timeframe or a garbled file before it goes
// anywhere; (2) confirm, which uploads the parsed candle JSON straight to
// Vercel Blob (bypassing this function's body-size limit - see api/upload.ts)
// and registers it in the chart_datasets table via /api/backtest.
export default function UploadDatasetDialog({ open, onClose, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pair, setPair] = useState('');
  const [timeframe, setTimeframe] = useState<string>(REPLAY_TIMEFRAMES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedCandles | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function reset() {
    setPair(''); setTimeframe(REPLAY_TIMEFRAMES[0]); setFile(null);
    setParsed(null); setParseError(null); setUploadError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFileChange(f: File | null) {
    setFile(f);
    setParsed(null);
    setParseError(null);
    if (!f) return;

    // Suggest a pair from the filename (e.g. "GBPUSD_1m.csv" -> "GBPUSD")
    // if one hasn't been typed yet - just a convenience, not load-bearing.
    if (!pair.trim()) {
      const guess = f.name.match(/[A-Za-z]{6}/)?.[0];
      if (guess) setPair(guess.toUpperCase());
    }

    setParsing(true);
    try {
      const result = await parseCandleFile(f);
      setParsed(result);
    } catch (e: any) {
      setParseError(e?.message ?? 'Could not parse this file.');
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!parsed || !pair.trim()) return;
    setUploading(true);
    setUploadError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const blob = await upload(`candles/${pair.trim().toUpperCase()}-${timeframe}-${Date.now()}.json`, JSON.stringify(parsed.candles), {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: 'application/json',
        clientPayload: JSON.stringify({ kind: 'candles' }),
        abortSignal: controller.signal,
      });

      const first = parsed.candles[0];
      const last = parsed.candles[parsed.candles.length - 1];
      await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'datasets',
          pair: pair.trim().toUpperCase(),
          timeframe,
          blob_url: blob.url,
          candle_count: parsed.candles.length,
          start_time: new Date(first.time * 1000).toISOString(),
          end_time: new Date(last.time * 1000).toISOString(),
        }),
      }).then(async (res) => {
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to save dataset'); }
      });

      reset();
      onUploaded();
      onClose();
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setUploadError('Upload timed out after 2 minutes. Large files can take a while on a slow connection - try again, or split the CSV into smaller date ranges.');
      } else {
        setUploadError(e?.message ?? 'Upload failed. Make sure Blob storage is set up for this Vercel project.');
      }
    } finally {
      clearTimeout(timeout);
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Candle Data</DialogTitle>
          <DialogClose onClose={() => { reset(); onClose(); }} />
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Export historical candles from TradingView, MT4/MT5, Dukascopy, or HistData.com as CSV and upload here.
            The file is parsed entirely in your browser - nothing is sent anywhere until you confirm below.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Pair</Label>
              <Input placeholder="e.g. GBPUSD" value={pair} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPair(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Timeframe</Label>
              <Select value={timeframe} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTimeframe(e.target.value)}>
                {REPLAY_TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">CSV File</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground"
            />
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing {file?.name}…
            </div>
          )}

          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <FileWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {parsed && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <p><span className="font-semibold">{parsed.candles.length.toLocaleString()}</span> candles parsed{parsed.skippedRows > 0 && <span className="text-muted-foreground"> ({parsed.skippedRows.toLocaleString()} rows skipped)</span>}</p>
              <p className="text-muted-foreground">
                {new Date(parsed.candles[0].time * 1000).toLocaleString()} &rarr; {new Date(parsed.candles[parsed.candles.length - 1].time * 1000).toLocaleString()}
              </p>
            </div>
          )}

          {uploadError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <FileWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={uploading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!parsed || !pair.trim() || uploading}>
            {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Uploading…</> : <><Upload className="w-3.5 h-3.5 mr-1" /> Save Dataset</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
