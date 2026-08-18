# PipEcho — Standalone (Vercel + Postgres)

This is a full rebuild of your Retool trading journal as a standalone app:
Vite + React frontend, Vercel serverless functions for the backend, and a
real Postgres database (works with Neon, Supabase, or any Postgres). No
Retool dependency — deploys and runs entirely on your own Vercel account.

## What's the same as before

- All the same data fields, calculations, and business logic (P&L math,
  duration calc, R-multiple strategy backtesting, monthly/yearly/weekday
  performance breakdown, profit factor, Excel import with the same
  column auto-detection).
- The day-of-week strategy filter and Profit Factor columns added earlier.

## What's different

- **The UI kit is rebuilt from scratch**, not copied from Retool's shadcn
  library (which wasn't included in the export — see the earlier
  conversation for why). It's intentionally simple: plain Tailwind
  components, no Radix primitives, no animation libraries. Functionally
  complete, but don't expect pixel-identical styling to the original —
  dialogs are simpler modals, selects are native `<select>` elements, etc.
  If you want it visually closer to shadcn later, that's a straightforward
  follow-up (swap in real shadcn components + Radix).
- **Data-fetching hooks are custom** (`useFetch` in `src/lib/api.ts`)
  rather than Retool's auto-generated ones, since those aren't portable
  outside Retool either.

## One-time setup

### 1. Create a Postgres database

Easiest path — do this from Vercel directly, no separate signup:

1. In your Vercel project → **Storage** tab → **Create Database** → choose
   **Neon** (Postgres). This provisions a free Neon database and
   automatically sets `DATABASE_URL` in your project's environment
   variables — no copy-pasting connection strings.
2. Alternatively, create a database yourself at [neon.tech](https://neon.tech)
   or [supabase.com](https://supabase.com) (both have generous free tiers)
   and manually add `DATABASE_URL` under Project Settings → Environment
   Variables in Vercel.

### 2. Run the schema

Open your database's SQL editor (Neon's or Supabase's web console both have
one) and run everything in **`schema.sql`** — creates the `trades`,
`strategies`, and `custom_columns` tables.

### 3. Deploy

Push this code to GitHub and import it into Vercel as normal (or if it's
already connected, just redeploy). Vercel auto-detects the Vite frontend
**and** the `/api/*.ts` files as serverless functions — no special
configuration needed beyond the `DATABASE_URL` env var from step 1.

### 4. Bring your data over

No migration script needed — the app has its own **Import Excel** button on
the Journal page (same column auto-detection as before). Export your
existing trades to `.xlsx` and import them directly once the app is live.

## Local development

```bash
npm install
vercel dev   # runs both the Vite frontend and the /api functions together
```

(Plain `npm run dev` also works for frontend-only work, but the `/api`
routes won't respond unless you're running through `vercel dev` or have
deployed — the Vite proxy in `vite.config.ts` expects `vercel dev` on
`localhost:3000`.)

## Project structure

```
api/                    Vercel serverless functions (the backend)
  _db.ts                 shared Postgres client + error handling wrapper
  trades/                CRUD, bulk import/delete, performance breakdown
  strategies/             CRUD
  summary/                strategy backtest calculation
  columns/                custom column CRUD
src/
  main.tsx, App.tsx       entry point + router
  components/Layout.tsx   nav shell
  pages/                  Summary, Journal, Performance, Strategies
  pages/ui/               TradeDialog, StrategyDialog, ImportTradesDialog,
                          ManageColumnsDialog
  pages/data/types.ts     shared types + formatting helpers
  lib/api.ts              fetch client + useFetch hook
  lib/ui/                 the rebuilt UI kit (button, card, dialog, table,
                          tabs, form controls)
schema.sql               run once against a fresh database
```

## Known limitations / things I couldn't verify

- I don't have a live Vercel or Postgres environment to actually run this
  against, so everything here was verified by (a) porting your existing,
  already-working business logic line-for-line rather than rewriting it,
  and (b) syntax- and bundle-checking every file with esbuild — both the
  full frontend module graph and all 13 backend functions compile cleanly
  with no import errors. What I can't fully guarantee without a live test:
  exact Vercel serverless function routing quirks, and whether `postgres`
  package defaults (SSL mode, connection pooling) need tuning for your
  specific provider. If something doesn't connect, the first thing to check
  is the `DATABASE_URL` format and SSL requirement for whichever provider
  you pick.
- The custom UI kit covers everything the original pages used, but if you
  add new features later that need a shadcn component I didn't build
  (e.g. a combobox, a date-range picker), you'll need to add it to
  `src/lib/ui/`.
