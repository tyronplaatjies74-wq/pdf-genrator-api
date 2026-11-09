import { db } from './db.service.js';

const period = () => new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)

export function getUsage(keyId) {
  const row = db().prepare('SELECT count FROM usage WHERE key_id = ? AND period = ?').get(keyId, period());
  return row ? row.count : 0;
}

export function increment(keyId) {
  db()
    .prepare(`INSERT INTO usage (key_id, period, count) VALUES (?, ?, 1)
              ON CONFLICT(key_id, period) DO UPDATE SET count = count + 1`)
    .run(keyId, period());
}