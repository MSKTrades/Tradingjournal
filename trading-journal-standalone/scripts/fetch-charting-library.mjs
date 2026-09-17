#!/usr/bin/env node
// Pulls TradingView's Advanced Charts package (a private repo we were
// granted access to - see the "Access to TradingView GitHub Repository"
// email) into public/charting_library and public/datafeeds at build time,
// instead of committing it into this repo.
//
// Why: this repo (MSKTrades/Tradingjournal) is public, and TradingView's
// license grants access "only for the project specified... does not give
// any right for redistribution or further use by any party other than the
// signed party." Committing the library's source into a public repo would
// hand it to anyone who clones this project - not what the license allows,
// regardless of intent. Fetching it fresh on every build keeps it out of
// git history entirely.
//
// Requires a GitHub personal access token with read access to
// tradingview/charting_library, set as the TV_CHARTING_LIBRARY_TOKEN
// environment variable:
//   - On Vercel: Project Settings -> Environment Variables -> add
//     TV_CHARTING_LIBRARY_TOKEN for Production/Preview (and Development if
//     you want `vercel dev` to pull it too).
//   - Locally: export TV_CHARTING_LIBRARY_TOKEN=... before `npm run dev`,
//     or put it in a .env.local that's git-ignored (never .env, which some
//     setups commit).
//
// If the token isn't set, this script skips with a warning rather than
// failing the whole build - everything else in the app works fine without
// Advanced Charts, and failing every build/dev-start over one optional
// feature would be worse than a chart that doesn't load.

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PUBLIC_DIR = join(REPO_ROOT, 'public');
const DEST_LIBRARY = join(PUBLIC_DIR, 'charting_library');
const DEST_DATAFEEDS = join(PUBLIC_DIR, 'datafeeds');

const token = process.env.TV_CHARTING_LIBRARY_TOKEN;

if (!token) {
  console.warn(
    '[fetch-charting-library] TV_CHARTING_LIBRARY_TOKEN not set - skipping. ' +
    'Advanced Charts will not be available (Backtest/Replay falls back to ' +
    'whatever is already at public/charting_library, or renders nothing if ' +
    'that folder is missing). Set the token to enable it - see the comment ' +
    'at the top of this file.'
  );
  process.exit(0);
}

// Re-fetching on every single `npm run dev` start would be slow and
// wasteful once it's already present - only fetch if missing, or if
// FORCE_FETCH_CHARTING_LIBRARY is set (useful when bumping to a newer
// version of the library later).
if (existsSync(DEST_LIBRARY) && !process.env.FORCE_FETCH_CHARTING_LIBRARY) {
  console.log('[fetch-charting-library] public/charting_library already present - skipping (set FORCE_FETCH_CHARTING_LIBRARY=1 to refetch).');
  process.exit(0);
}

const tmpDir = mkdtempSync(join(tmpdir(), 'tv-charting-library-'));

try {
  console.log('[fetch-charting-library] cloning tradingview/charting_library (master)...');
  // x-access-token as the username works with any token type (classic or
  // fine-grained) and, unlike embedding the token as the username directly,
  // reads cleanly in any log line that might echo the command.
  execSync(
    `git clone --depth 1 --branch master "https://x-access-token:${token}@github.com/tradingview/charting_library.git" "${tmpDir}"`,
    { stdio: ['ignore', 'ignore', 'pipe'] } // swallow stdout (may echo the URL), keep stderr for real errors
  );

  mkdirSync(PUBLIC_DIR, { recursive: true });

  // Only the runtime bundle + type declarations are needed at the
  // destination the widget actually fetches assets relative to - .git,
  // README, changelog, test.html etc. from the clone are left behind in
  // tmpDir, which gets removed below either way.
  cpSync(join(tmpDir, 'charting_library'), DEST_LIBRARY, { recursive: true });
  cpSync(join(tmpDir, 'charting_library.d.ts'), join(PUBLIC_DIR, '..', 'charting_library.d.ts'));
  cpSync(join(tmpDir, 'datafeeds', 'udf'), join(DEST_DATAFEEDS, 'udf'), { recursive: true });

  console.log('[fetch-charting-library] done - public/charting_library and public/datafeeds/udf populated.');
} catch (err) {
  console.error('[fetch-charting-library] failed to fetch the library:', err.message);
  console.error('[fetch-charting-library] check that TV_CHARTING_LIBRARY_TOKEN is valid and still has access to tradingview/charting_library.');
  // Non-fatal, same reasoning as the missing-token case above - don't take
  // the whole build down over this one optional feature.
  process.exit(0);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
