-- Trading Journal — full schema for a fresh Postgres database (Neon, Supabase,
-- or any Postgres). Run this once against your new database before deploying.

CREATE TABLE IF NOT EXISTS trades (
  id                     SERIAL PRIMARY KEY,
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
