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
  comments               TEXT,
  extra_data             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- custom column values
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

CREATE INDEX IF NOT EXISTS idx_trades_placed_at ON trades (trade_placed_at);
CREATE INDEX IF NOT EXISTS idx_trades_number    ON trades (trade_number);
CREATE INDEX IF NOT EXISTS idx_trades_account   ON trades (account_id);

-- Idempotent column additions in case you're upgrading a database that was
-- created before the day-of-week / session-window strategy filters existed.
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS time_start TEXT;
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS time_end TEXT;

-- ============================================================================
-- MIGRATION: multi-account support. Everything above already reflects the
-- final shape for a brand-new database, so on a fresh install this block is a
-- formality (it just creates the one starter "Default" account). On an
-- existing database that predates accounts, this is what actually adds the
-- account_id column, backfills every existing trade into a "Default" account,
-- and locks the column down with NOT NULL + a foreign key. Safe to run more
-- than once.
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
