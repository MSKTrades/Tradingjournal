import postgres from 'postgres';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Single shared connection, reused across warm serverless invocations.
// DATABASE_URL is set by the Neon Vercel integration automatically (or set
// it yourself in Project Settings -> Environment Variables if using another
// Postgres provider).
let _sql: ReturnType<typeof postgres> | null = null;
export function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = postgres(url, { ssl: 'require' });
  }
  return _sql;
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

/** Wraps a handler with CORS + JSON error handling so every endpoint doesn't
 * have to repeat this boilerplate. */
export function withApi(fn: Handler): Handler {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  };
}
