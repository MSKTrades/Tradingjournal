-- Trading Journal — full schema for a fresh Postgres database (Neon, Supabase,
-- or any Postgres). Run this once against your new database before deploying.
-- Safe to re-run against an existing database too — every statement below is
-- idempotent, and the migration block at the bottom upgrades older databases
-- (pre-multi-account) in place without touching existing trade data.

CREATE TABLE IF NOT EXISTS accounts (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT,                 -- free-form label, e.g. "Live", "Paper", "Backtest"
  starting_balance  NUMERIC,
  active            BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional prop-firm-style risk rules for an account, e.g. "5% daily loss
-- limit, 10% max drawdown" (common FTMO/funded-challenge terms). Both are
-- expressed as a percent of the account's starting_balance and are entirely
-- optional (NULL = not tracked) - set one or both to power the Risk
-- Guardrail widget on the Summary page and the drawdown limit line on the
-- Performance page's drawdown chart. Purely informational: nothing in this
-- app blocks a trade from being logged if a limit is exceeded, it's a
-- warning surface, not an enforcement mechanism.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS daily_loss_limit_pct NUMERIC;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS max_drawdown_limit_pct NUMERIC;

CREATE TABLE IF NOT EXISTS trades (
  id                     SERIAL PRIMARY KEY,
  account_id             INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  trade_number           INTEGER,
  start_capital          NUMERIC,
  end_capital            NUMERIC,
  gain_loss              NUMERIC,
  gain_loss_pct          NUMERIC,
  structure_15m          TEXT,
  wr_1m                  TEXT,
  before_chart_1m        TEXT,
  direction              TEXT NOT NULL DEFAULT 'Long',
  liquidity_swept        TEXT,
  distance_from_asia     NUMERIC,
  liquidity_swept_no     INTEGER,
  cisd_break             NUMERIC,
  total_inverse_candles  NUMERIC,
  inverse_candle_size    NUMERIC,
  sl_pips                NUMERIC,
  position_size          NUMERIC,
  profit_loss            TEXT,          -- 'Profit' | 'Loss' | null
  rr                     NUMERIC,
  entry_price            NUMERIC,
  tp_price                NUMERIC,
  sl_price                NUMERIC,
  coin_token             TEXT,
  trade_placed_at        DATE,
  trade_executed_at      TEXT,          -- HH:MM
  session_in             TEXT,
  date_closed            DATE,
  time_closed            TEXT,          -- HH:MM
  closed_session         TEXT,
  trade_duration         TEXT,          -- computed, e.g. "2h 14m"
  partial_1              NUMERIC,
  partial_2              NUMERIC,
  reached_1r2            BOOLEAN NOT NULL DEFAULT false,
  reached_1r3            BOOLEAN NOT NULL DEFAULT false,
  reached_1r4            BOOLEAN NOT NULL DEFAULT false,
  reached_1r5            BOOLEAN NOT NULL DEFAULT false,
  max_rr                 NUMERIC,
  comments               TEXT,          -- flattened plain-text mirror of notes_blocks, for list views
  extra_data             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- custom column values
  screenshots            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- derived: image URLs pulled from notes_blocks
  notes_blocks           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ordered [{type:'text',value} | {type:'image',url}]
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategies (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  conditions     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{field, op, value}, ...]
  days           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [] = all days; else [0..6], 0=Sun
  time_start     TEXT,          -- e.g. "07:00"; null = no start bound
  time_end       TEXT,          -- e.g. "11:00"; null = no end bound
  tp1_rr         NUMERIC NOT NULL DEFAULT 3,
  tp2_rr         NUMERIC,
  split_percent  NUMERIC,
  active         BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  -- Which accounts this strategy is counted on. [] (the default) means every
  -- account, including ones created after this strategy was - preserves
  -- today's behavior for every strategy that already exists. Restricting a
  -- strategy to specific account ids is opt-in from the Strategies page, for
  -- when you don't want e.g. a strategy built for one account's rules to
  -- also get evaluated against a completely different account's trades.
  account_ids    JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Upgrade an existing database in place: every strategy that already exists
-- gets the default '[]' (applies to every account), so nothing you've
-- already built stops showing up anywhere until you deliberately restrict it.
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS account_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Custom fields are scoped to a single account (account_id), not shared
-- across every account you track - a fresh account starts with none, and a
-- field you add while journaling one account never shows up on another. See
-- the migration near the bottom of this file for how fields that predate
-- this scoping (back when they were global) were carried forward.
CREATE TABLE IF NOT EXISTS custom_columns (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  col_key     TEXT NOT NULL,          -- key used inside trades.extra_data; unique per account, not globally (see index below)
  data_type   TEXT NOT NULL DEFAULT 'text',
  visible     BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  account_id  INTEGER REFERENCES accounts(id) ON DELETE CASCADE
);

-- Checklists: named, reusable rule sets you define for yourself (e.g.
-- "London Reversal", "Breakout Setup"). Global across accounts, same as
-- `strategies` — one trader, several rule sets, one per setup they trade.
-- account_ids works exactly like strategies.account_ids ([] = every
-- account, including new ones; a non-empty array restricts a rule set to
-- just those accounts) - same reasoning: a checklist built for one
-- account's setup (e.g. a "London Reversal" rule set for a GBPUSD-only
-- account) shouldn't clutter the grading picker or compliance stats on a
-- completely different account.
CREATE TABLE IF NOT EXISTS checklists (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade an existing database in place: every checklist that already
-- exists gets the default '[]' (applies to every account), so nothing you've
-- already built stops showing up anywhere until you deliberately restrict it.
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS account_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Individual rules ("Waited for CISD?", "Risk <= 1%?") belonging to one
-- checklist. Checked off per trade (see trades.checklist_results below)
-- only when a trade opts into using a checklist at all
-- (trades.checklist_enabled) — not every trade needs one, so it's never
-- mandatory.
CREATE TABLE IF NOT EXISTS checklist_items (
  id          SERIAL PRIMARY KEY,
  text        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent migration: checklist_items used to be one flat, ungrouped
-- list (no checklist_id — from an earlier version of this feature that
-- was never actually deployed, but this stays safe to run either way).
-- Add the column now, and if any rows come up NULL (a prior flat-list
-- install), fold them into one "General" checklist rather than orphaning
-- or silently dropping rules you already typed in.
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE;

DO $$
DECLARE
  general_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM checklist_items WHERE checklist_id IS NULL) THEN
    INSERT INTO checklists (name) VALUES ('General') RETURNING id INTO general_id;
    UPDATE checklist_items SET checklist_id = general_id WHERE checklist_id IS NULL;
  END IF;
END $$;

-- Daily Routine: a free-text note per calendar day for whatever pre-trade
-- checks you want to log before placing anything — "checked EU/GU/UJ for
-- CISD, no setup yet", daily bias, which pairs you scanned, etc. One row per
-- date (note_date is UNIQUE) so saving today's note again upserts that same
-- row instead of piling up duplicates; kept as a running history on the
-- Checklists page rather than wiped each day, since a past day's notes are
-- useful to scroll back through later.
-- `points` is a JSONB array of strings — "Checked EU/GU/UJ for CISD",
-- "Confirmed daily bias", one entry per line item, rendered stacked one
-- below the other (same "Rule 1: / Rule 2: ..." spirit as checklist rules)
-- instead of a single free-text paragraph. `text` is kept around (unused by
-- the app going forward) purely so nothing breaks for anyone upgrading from
-- the very first version of this table; existing notes are copied into
-- `points` as a single-item array below so a day you already logged doesn't
-- just disappear once the UI switches to reading points.
CREATE TABLE IF NOT EXISTS daily_routine_notes (
  id          SERIAL PRIMARY KEY,
  note_date   DATE NOT NULL UNIQUE,
  text        TEXT NOT NULL DEFAULT '',
  points      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade an existing database in place: add `points` if this table was
-- created before the point-system redesign, then backfill any pre-existing
-- free-text note into it as a single point. The WHERE clause makes this
-- safe to run every time schema.sql is re-applied — once a row has been
-- backfilled its `points` is no longer '[]', so it's skipped on later runs.
ALTER TABLE daily_routine_notes ADD COLUMN IF NOT EXISTS points JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE daily_routine_notes
  SET points = jsonb_build_array(text)
  WHERE points = '[]'::jsonb AND text IS NOT NULL AND btrim(text) <> '';

CREATE INDEX IF NOT EXISTS idx_trades_placed_at ON trades (trade_placed_at);
CREATE INDEX IF NOT EXISTS idx_trades_number    ON trades (trade_number);

-- Idempotent column additions in case you're upgrading a database that was
-- created before the day-of-week / session-window strategy filters existed.
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS time_start TEXT;
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS time_end TEXT;

-- Idempotent column addition for the trade detail screenshots feature.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS screenshots JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Idempotent column additions for the Notion-style notes editor and the new
-- Entry / TP / SL price fields.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS notes_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_price NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tp_price NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sl_price NUMERIC;

-- Idempotent column additions for the trade rules checklist.
-- checklist_id records WHICH checklist a trade was graded against (nullable
-- — set only once the trader picks one on the trade screen);
-- checklist_results stays keyed by checklist_item id, not checklist id, so
-- it doesn't care which checklist that item belongs to.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS checklist_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS checklist_id INTEGER REFERENCES checklists(id) ON DELETE SET NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS checklist_results JSONB NOT NULL DEFAULT '{}'::jsonb;  -- { "<checklist_item id>": true|false }

-- ============================================================================
-- REPAIR: undo double-JSON-encoding caused by a real driver-behavior bug in
-- api/trades/index.ts, api/trades/[id].ts, api/trades/bulk-add.ts, and
-- api/strategies.ts. Those files used to call JSON.stringify(...) on values
-- bound to a `::jsonb`-cast query parameter — but the `postgres` npm driver
-- ALSO applies its own JSON serializer to any parameter it infers (from the
-- `::jsonb` cast in the query text) is destined for a jsonb column, so an
-- already-stringified value got serialized a second time. The column ends
-- up holding a jsonb *string* containing escaped JSON text instead of a real
-- jsonb array/object: `jsonb_typeof(...)` reports 'string' instead of
-- 'array'/'object', `jsonb_array_length(...)` throws "cannot get array
-- length of a scalar", and on the frontend a corrupted notes_blocks value
-- arrives as a plain JS string instead of an array — which NotesEditor then
-- spreads character-by-character into a wall of broken "Trade screenshot"
-- blocks. This was NOT a broken-upload problem — the screenshots you pasted
-- really did upload; the URL was just trapped inside a mis-encoded string,
-- unreadable until unwrapped. Confirmed by reproducing the exact bug against
-- a throwaway local Postgres instance and verifying this exact repair
-- expression restores it. The code that wrote it is now fixed (raw values,
-- no pre-stringify), so this is a one-time cleanup of what earlier code
-- already wrote — safe to run more than once; a no-op once nothing is left
-- to unwrap. Loops (capped at 8 passes) because a value that got saved
-- through the buggy code more than once could be wrapped more than once.
--
-- Runs here, before ANY of the array-function backfills below (which all
-- call jsonb_array_length/jsonb_array_elements on notes_blocks/screenshots),
-- because those throw the same "scalar" error on still-corrupted data and
-- would abort the rest of the script.
-- ============================================================================
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM trades
      WHERE jsonb_typeof(notes_blocks) = 'string'
         OR jsonb_typeof(screenshots) = 'string'
         OR jsonb_typeof(extra_data) = 'string'
    ) AND NOT EXISTS (
      SELECT 1 FROM strategies
      WHERE jsonb_typeof(conditions) = 'string'
         OR jsonb_typeof(days) = 'string'
    );

    UPDATE trades SET notes_blocks = (notes_blocks #>> '{}')::jsonb WHERE jsonb_typeof(notes_blocks) = 'string';
    UPDATE trades SET screenshots  = (screenshots  #>> '{}')::jsonb WHERE jsonb_typeof(screenshots)  = 'string';
    UPDATE trades SET extra_data   = (extra_data   #>> '{}')::jsonb WHERE jsonb_typeof(extra_data)   = 'string';
    UPDATE strategies SET conditions = (conditions #>> '{}')::jsonb WHERE jsonb_typeof(conditions) = 'string';
    UPDATE strategies SET days       = (days       #>> '{}')::jsonb WHERE jsonb_typeof(days)       = 'string';
  END LOOP;
END $$;

-- One-time backfill: fold any existing `comments` text and `screenshots`
-- into the new unified notes_blocks stream, so nothing you already wrote
-- disappears from the new editor. Both halves are idempotent (guarded so
-- they only touch rows that haven't been migrated yet). Doesn't touch
-- account_id, so it's safe to run before the multi-account migration below.
UPDATE trades
SET notes_blocks = jsonb_build_array(jsonb_build_object('type', 'text', 'value', comments))
WHERE notes_blocks = '[]'::jsonb AND comments IS NOT NULL AND comments <> '';

UPDATE trades
SET notes_blocks = notes_blocks || (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', 'image', 'url', s)), '[]'::jsonb)
  FROM jsonb_array_elements_text(screenshots) AS s
)
WHERE screenshots IS NOT NULL
  AND jsonb_array_length(screenshots) > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(notes_blocks) AS b WHERE b->>'type' = 'image'
  );

-- ============================================================================
-- MIGRATION: multi-account support. Everything above already reflects the
-- final shape for a brand-new database, so on a fresh install this block is a
-- formality (it just creates the one starter "Default" account). On an
-- existing database that predates accounts, this is what actually adds the
-- account_id column, backfills every existing trade into a "Default" account,
-- and locks the column down with NOT NULL + a foreign key. Safe to run more
-- than once.
--
-- This has to run BEFORE anything else below that references
-- trades.account_id (the index and the starting-capital backfill) — on an
-- upgrade, trades.account_id doesn't exist until this block creates it, and
-- Postgres aborts the rest of the script the instant any earlier statement
-- references a column that isn't there yet.
-- ============================================================================
DO $$
DECLARE
  default_account_id INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE trades ADD COLUMN account_id INTEGER;
  END IF;

  IF EXISTS (SELECT 1 FROM trades WHERE account_id IS NULL) THEN
    SELECT id INTO default_account_id FROM accounts WHERE name = 'Default' ORDER BY id ASC LIMIT 1;
    IF default_account_id IS NULL THEN
      INSERT INTO accounts (name, type, sort_order) VALUES ('Default', 'Live', 0) RETURNING id INTO default_account_id;
    END IF;
    UPDATE trades SET account_id = default_account_id WHERE account_id IS NULL;
  END IF;

  -- Fresh install with zero trades still needs at least one account to exist
  -- so the account switcher isn't empty on first load.
  IF NOT EXISTS (SELECT 1 FROM accounts) THEN
    INSERT INTO accounts (name, type, sort_order) VALUES ('Default', 'Live', 0);
  END IF;

  ALTER TABLE trades ALTER COLUMN account_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trades_account_id_fkey'
  ) THEN
    ALTER TABLE trades ADD CONSTRAINT trades_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Safe now: the block above guarantees trades.account_id exists, whether
-- this is a fresh install (created it via the CREATE TABLE above) or an
-- upgrade (added it just now).
CREATE INDEX IF NOT EXISTS idx_trades_account ON trades (account_id);

-- ============================================================================
-- MIGRATION: account-level starting capital. Trades used to store a manually
-- typed `start_capital` on every row; that's replaced by a single
-- `starting_balance` on the account, with each trade's start/end capital and
-- P&L now derived automatically (see recalcAccountCapital in api/_db.js,
-- run after every trade/account write). This one-time step seeds
-- `starting_balance` from each account's chronologically-first trade, so the
-- switch-over reproduces your existing numbers exactly instead of zeroing
-- them out. Guarded to only touch accounts that don't already have a
-- starting_balance set, so it's safe to re-run and won't clobber a value
-- you've set deliberately via the Account dialog.
--
-- Runs AFTER the multi-account migration above, since it reads
-- trades.account_id, which on an upgrade doesn't exist until that block
-- creates it.
-- ============================================================================
UPDATE accounts
SET starting_balance = (
  SELECT t.start_capital FROM trades t
  WHERE t.account_id = accounts.id
  ORDER BY COALESCE(t.trade_number, 999999) ASC,
           COALESCE(t.trade_placed_at, t.created_at::date) ASC,
           t.created_at ASC
  LIMIT 1
)
WHERE starting_balance IS NULL
  AND EXISTS (SELECT 1 FROM trades WHERE trades.account_id = accounts.id);

-- ============================================================================
-- MIGRATION: move SMC-specific fields out of the built-in "SMC / ICT
-- Metrics" section and into ordinary user-defined custom fields. These are
-- specific to one trading strategy, not something every ForexForge user
-- needs — moving them to custom fields means new users don't see them by
-- default, while your existing values carry over untouched.
--
-- The original columns (cisd_break, total_inverse_candles, etc.) are left in
-- place but unused going forward, rather than dropped, so there's no risk to
-- historical data if anything needs to be cross-checked later.
-- ============================================================================
INSERT INTO custom_columns (name, col_key, data_type, visible, sort_order)
VALUES
  ('CISD Break',             'cisd_break',            'number', true, 100),
  ('Total Inverse Candles',  'total_inverse_candles', 'number', true, 101),
  ('Inverse Candle Size',    'inverse_candle_size',   'number', true, 102),
  ('Distance from Asia H/L', 'distance_from_asia',    'number', true, 103),
  ('Liquidity Swept',        'liquidity_swept',       'text',   true, 104),
  ('Liquidity Swept No.',    'liquidity_swept_no',    'number', true, 105),
  ('SL Pips',                'sl_pips',                'number', true, 106)
ON CONFLICT (col_key) DO NOTHING;

UPDATE trades SET extra_data = extra_data || jsonb_build_object('cisd_break', cisd_break)
WHERE cisd_break IS NOT NULL AND NOT (extra_data ? 'cisd_break');

UPDATE trades SET extra_data = extra_data || jsonb_build_object('total_inverse_candles', total_inverse_candles)
WHERE total_inverse_candles IS NOT NULL AND NOT (extra_data ? 'total_inverse_candles');

UPDATE trades SET extra_data = extra_data || jsonb_build_object('inverse_candle_size', inverse_candle_size)
WHERE inverse_candle_size IS NOT NULL AND NOT (extra_data ? 'inverse_candle_size');

UPDATE trades SET extra_data = extra_data || jsonb_build_object('distance_from_asia', distance_from_asia)
WHERE distance_from_asia IS NOT NULL AND NOT (extra_data ? 'distance_from_asia');

UPDATE trades SET extra_data = extra_data || jsonb_build_object('liquidity_swept', liquidity_swept)
WHERE liquidity_swept IS NOT NULL AND NOT (extra_data ? 'liquidity_swept');

UPDATE trades SET extra_data = extra_data || jsonb_build_object('liquidity_swept_no', liquidity_swept_no)
WHERE liquidity_swept_no IS NOT NULL AND NOT (extra_data ? 'liquidity_swept_no');

UPDATE trades SET extra_data = extra_data || jsonb_build_object('sl_pips', sl_pips)
WHERE sl_pips IS NOT NULL AND NOT (extra_data ? 'sl_pips');

-- Idempotent column addition for the Entry Type field (Market / Limit / Stop).
ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_type TEXT;

-- Idempotent column addition for custom, user-defined tags on trades.
-- Stored as a plain JSONB array of tag NAME strings directly on the trade
-- (like screenshots/notes_blocks) rather than a normalized join table -
-- simpler to filter on (a single `tags ?| array[...]` / `@>` check, no
-- join) and consistent with how this app already stores small per-trade
-- lists. The canonical/reusable tag list (so the picker can suggest
-- existing tags instead of you retyping them, and so each tag can carry a
-- color) lives in its own `tags` table below; renaming a tag there does
-- NOT retroactively rename it on trades that already used the old name,
-- same tradeoff already accepted for custom_columns.col_key.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS tags (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '#f59e0b',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_tags ON trades USING GIN (tags);

-- Tag GROUPS (categories) with per-group options, e.g. group "Confidence
-- Level" with options High/Medium/Low/Very Low - FX Replay calls these
-- "tag groups"/subtags. Deliberately a separate feature from the flat
-- `tags` table above rather than folded into it: a flat tag is a free-form
-- label ("A+ Setup"), while a tag-GROUP selection is "pick one (or a few)
-- named value(s) FROM this specific category" - trying to encode that as
-- flat name strings (e.g. "Confidence Level: High") would make filtering
-- by "any Confidence Level" or renaming a whole category painful. Options
-- cascade-delete with their group; a trade's selections are stored by
-- group/option NAME (see trades.tag_selections below), same by-name-not-id
-- tradeoff already accepted for the flat tags table and custom_columns.
CREATE TABLE IF NOT EXISTS tag_groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tag_group_options (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#f59e0b',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, name)
);

-- Per-trade selections: { "Confidence Level": ["High"], "SL Levels": ["5M"] }
-- keyed by tag_groups.name, values are arrays of tag_group_options.name (so
-- more than one option per group is allowed, same as the flat tags list).
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tag_selections JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- Chart Replay / Backtesting. Deliberately separate from `trades` /
-- `accounts` — this is you rehearsing against historical candles, not real
-- (or even paper) money, so it gets its own tables rather than being bolted
-- onto the live journal's capital-chain logic.
--
-- The actual OHLC candle data does NOT live in Postgres — you upload a CSV
-- export (MT4/MT5, TradingView, Dukascopy, HistData, ...) straight to Vercel
-- Blob storage from the browser (same client-direct-upload path already used
-- for trade screenshots), and this table is just the registry: which
-- pair/timeframe combinations you've uploaded, where the parsed candle JSON
-- lives in Blob, and some quick metadata (candle count, date range) for the
-- dataset picker. Keeping candles out of Postgres avoids blowing up a Neon
-- free-tier database with what can easily be hundreds of thousands of rows
-- for a few months of 1-minute data.
-- ============================================================================
CREATE TABLE IF NOT EXISTS chart_datasets (
  id            SERIAL PRIMARY KEY,
  pair          TEXT NOT NULL,
  timeframe     TEXT NOT NULL,          -- '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  blob_url      TEXT NOT NULL,          -- Vercel Blob URL for the parsed candle JSON
  candle_count  INTEGER NOT NULL DEFAULT 0,
  start_time    TIMESTAMPTZ,            -- first candle's timestamp
  end_time      TIMESTAMPTZ,            -- last candle's timestamp
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pair, timeframe)                -- re-uploading the same pair/timeframe replaces it (upsert)
);

-- One row per practice trade you place while stepping/playing through a
-- chart_datasets replay. entry_time/exit_time are candle timestamps *within
-- the replay*, not wall-clock time. result stays NULL while the trade is
-- still open in the replay (i.e. the replay hasn't reached a candle whose
-- high/low touches sl_price or tp_price yet, and you haven't closed it by
-- hand either).
CREATE TABLE IF NOT EXISTS backtest_trades (
  id            SERIAL PRIMARY KEY,
  dataset_id    INTEGER NOT NULL REFERENCES chart_datasets(id) ON DELETE CASCADE,
  direction     TEXT NOT NULL DEFAULT 'Long',   -- 'Long' | 'Short'
  entry_price   NUMERIC NOT NULL,
  sl_price      NUMERIC,
  tp_price      NUMERIC,
  entry_time    TIMESTAMPTZ NOT NULL,
  exit_time     TIMESTAMPTZ,
  exit_price    NUMERIC,
  result        TEXT,                            -- 'Profit' | 'Loss' | null while open
  rr            NUMERIC,                          -- R-multiple actually achieved on close
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_dataset ON backtest_trades (dataset_id);

-- Quality/mistake tags on practice trades (e.g. "A+ Setup", "Off-Plan",
-- "FOMO"), same idea as trades.tags on the real Journal. Deliberately
-- shares that same `tags` table/vocabulary rather than a second tag list -
-- one pool of tag names across real and practice trades means the same
-- "Off-Plan" you use in the Journal shows up here too, instead of you
-- having to redefine it.
ALTER TABLE backtest_trades ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================================
-- Auth. One row per person who can sign in. Deliberately minimal - this is a
-- single-user-per-login product (you and your own journal), not a
-- multi-tenant system with per-user data partitioning, so `users` isn't
-- referenced by `accounts`/`trades`/etc. It just gates who can reach the app
-- at all. password_hash is a bcrypt hash, never a plaintext password - and
-- is NULL for accounts created via Google/Facebook (OAuth-only accounts
-- never get a local password unless the person later sets one).
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT,
  name           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade an existing (pre-OAuth) database in place: password_hash was
-- originally NOT NULL back when email/password was the only sign-in method.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Which OAuth provider (if any) this account is linked to, and that
-- provider's own user ID for it - not currently used to look anyone up
-- (email is the single source of truth for "is this the same person",
-- so signing up with a password and later using "Continue with Google" on
-- the same email just links onto the existing row) but kept for reference /
-- future use (e.g. showing "connected via Google" in a settings page).
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================================
-- MIGRATION: scope custom_columns to a single account instead of showing
-- every field on every account. Before this, a field you added anywhere
-- (e.g. the SMC fields migrated in above) showed up on every account you
-- track, including a brand-new one created to test a completely different
-- strategy - not what you want when that new account doesn't use those
-- fields at all.
--
-- Upgrade path for a database that already has global custom_columns rows
-- (account_id IS NULL, from before this column existed): for each such
-- field, look at which accounts actually have a trade that USES it (a trade
-- whose extra_data contains that key) and give each of those accounts its
-- own copy of the field. An account with zero trades referencing a given
-- field - such as one you just created - gets none of them, exactly as if
-- it always had its own blank set of custom fields. A field nobody had
-- actually used on any account is dropped entirely rather than carried
-- forward as dead weight; nothing is lost from any trade's data either way,
-- since extra_data on the trades themselves is never touched here.
--
-- Self-guarding: once this has run, no custom_columns rows are left with
-- account_id IS NULL, so re-running schema.sql again is a no-op here.
-- ============================================================================
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE;

-- The old "one col_key for the whole app" uniqueness rule no longer applies
-- now that the same field name/key can independently exist per account.
ALTER TABLE custom_columns DROP CONSTRAINT IF EXISTS custom_columns_col_key_key;

INSERT INTO custom_columns (name, col_key, data_type, visible, sort_order, account_id)
SELECT DISTINCT c.name, c.col_key, c.data_type, c.visible, c.sort_order, t.account_id
FROM custom_columns c
JOIN trades t ON t.extra_data ? c.col_key
WHERE c.account_id IS NULL;

DELETE FROM custom_columns WHERE account_id IS NULL;

ALTER TABLE custom_columns ALTER COLUMN account_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS custom_columns_account_col_key_idx ON custom_columns (account_id, col_key);
