import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { withApi } from './_db.js';

// Generates short-lived client tokens so the browser can upload trade
// screenshots directly to Vercel Blob storage (bypassing this function's
// body-size limit entirely — only the small token request round-trips here,
// the actual image bytes go straight to Blob). Requires a Blob store to be
// attached to the Vercel project (Storage tab -> Create Database -> Blob),
// which sets BLOB_READ_WRITE_TOKEN automatically.
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as any,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        addRandomSuffix: true,
        maximumSizeInBytes: 10 * 1024 * 1024, // 10MB per screenshot
      }),
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
