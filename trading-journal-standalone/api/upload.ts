import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { withApi } from './_db.js';

// Generates short-lived client tokens so the browser can upload trade
// screenshots directly to Vercel Blob storage (bypassing this function's
// body-size limit entirely — only the small token request round-trips here,
// the actual image bytes go straight to Blob). Requires a *public* Blob
// store attached to the Vercel project (Storage tab -> Create Database ->
// Blob -> access: Public — a private store won't work, since every call
// below uses access: 'public').
//
// If more than one Blob store is ever connected to this project, Vercel
// scopes each store's token behind a store-name-prefixed variable
// (e.g. `forexblob_READ_WRITE_TOKEN`) instead of the plain
// `BLOB_READ_WRITE_TOKEN` — connecting a second store does NOT repoint the
// generic name at it. Prefer the explicit `forexblob_` token so this always
// resolves to the intended public store regardless of what else is
// connected; fall back to the generic name for a single-store setup.
const BLOB_TOKEN = process.env.forexblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as any,
      token: BLOB_TOKEN,
      // Two very different callers share this one token endpoint (kept to
      // one file rather than a second api/upload-candles.ts, same
      // function-budget reasoning as api/columns.ts): trade screenshots
      // (small images, default/no clientPayload) and chart-replay candle
      // datasets (a parsed JSON array that can run tens of MB for months of
      // 1-minute data, tagged with clientPayload '{"kind":"candles"}' by the
      // Backtest page's uploader). Branch on that payload so screenshots
      // keep their tight 10MB image-only limit while candle uploads get a
      // larger JSON-only allowance, instead of loosening the screenshot path
      // to accommodate both.
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let kind: string | undefined;
        try { kind = clientPayload ? JSON.parse(clientPayload).kind : undefined; } catch { /* ignore malformed payload */ }

        if (kind === 'candles') {
          return {
            allowedContentTypes: ['application/json', 'text/plain'],
            addRandomSuffix: true,
            maximumSizeInBytes: 75 * 1024 * 1024, // 75MB — comfortably covers months of 1m candles
          };
        }
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          addRandomSuffix: true,
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB per screenshot
        };
      },
      onUploadCompleted: async () => {
        // No server-side bookkeeping needed here — the client appends the
        // returned blob URL onto the trade's `screenshots` field itself and
        // saves it through the normal trade save flow.
      },
    });
    res.status(200).json(jsonResponse);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Upload token generation failed' });
  }
});
