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
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_columns (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  col_key     TEXT NOT NULL UNIQUE,   -- key used inside trades.extra_data
  data_type   TEXT NOT NULL DEFAULT 'text',
  visible     BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Trade rules you define for yourself ("Waited for CISD?", "Risk <= 1%?").
-- Global across accounts, same as `strategies` — one trader, one rule set.
-- Checked off per trade (see trades.checklist_results below) only when a
-- trade opts into using the checklist at all (trades.checklist_enabled) —
-- not every trade needs one, so it's never mandatory.
CREATE TABLE IF NOT EXISTS checklist_items (
  id          SERIAL PRIMARY KEY,
  text        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
ALTER TABLE trades ADD COLUMN IF NOT EXISTS checklist_enabled BOOLEAN NOT NULL DEFAULT false;
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
