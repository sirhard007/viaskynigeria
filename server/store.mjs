import { summarize } from './model.mjs';

export class SupabaseStore {
  constructor(url, key) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url || '') || !key) throw new Error('Analytics database is not configured.');
    this.url = url; this.key = key;
  }
  async request(route, data, extraHeaders = {}) {
    const headers = { apikey: this.key, 'Content-Type': 'application/json', ...extraHeaders };
    // Legacy service_role JWTs need Authorization; modern secret keys use apikey.
    if (this.key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + this.key;
    const response = await fetch(this.url + '/rest/v1/' + route, { method: 'POST', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Analytics database request failed (' + response.status + ').');
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async insert(rows) { await this.request('viasky_events?on_conflict=id', rows, { Prefer: 'resolution=ignore-duplicates,return=minimal' }); }
  async rate(key, limit, seconds) { return this.request('rpc/viasky_rate_limit', { p_key: key, p_limit: limit, p_seconds: seconds }); }
  async summary(range) { return this.request('rpc/viasky_summary', { p_start: range.start, p_end: range.end, p_days: range.days }); }
}

export async function localStore(filename) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_time ON events(occurred_at); CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  return {
    db,
    async insert(rows) {
      db.exec('BEGIN');
      try {
        const add = db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?)');
        rows.forEach(row => add.run(row.id, row.occurred_at, JSON.stringify(row)));
        db.prepare('DELETE FROM events WHERE occurred_at < ?').run(new Date(Date.now() - 90 * 86400000).toISOString());
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async rate(key, limit, seconds) {
      const now = Date.now();
      db.prepare('DELETE FROM limits WHERE expires < ?').run(now);
      db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + seconds * 1000);
      return db.prepare('SELECT count FROM limits WHERE key=?').get(key).count <= limit;
    },
    async summary(range) {
      db.prepare('DELETE FROM events WHERE occurred_at < ?').run(new Date(Date.now() - 90 * 86400000).toISOString());
      const rows = db.prepare('SELECT payload FROM events WHERE occurred_at >= ? AND occurred_at < ?').all(range.start, range.end).map(row => JSON.parse(row.payload));
      return summarize(rows, range);
    }
  };
}
