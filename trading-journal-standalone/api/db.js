import postgres from 'postgres';

let _sql = null;

export function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = postgres(url, { ssl: 'require' });
  }
  return _sql;
}

export function withApi(fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal error',
      });
    }
  };
}
