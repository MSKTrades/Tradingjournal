-- PipEcho — leads table for the new /tools/session-clock lead magnet.
-- Idempotent: safe to run even if it's somehow already been applied.
-- Run this in Neon's SQL editor BEFORE deploying the code in this delivery
-- (the new api/columns.ts resource=lead branch inserts into this table —
-- deploying the code first would 500 on every submission until this runs).

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown', -- which free tool/page captured this email, e.g. 'session_clock_tool'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same email can appear more than once if it comes from a different
-- source/tool later, but not twice for the SAME tool (matches the
-- resource=lead handler's existing-check before inserting).
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_source_idx ON leads (email, source);
