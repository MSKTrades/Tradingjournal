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
