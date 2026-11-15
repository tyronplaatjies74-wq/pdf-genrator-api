import { db } from './db.service.js';

// Monthly period key in UTC, e.g. "2026-11".
export const currentPeriod = (d = new Date()) => d.toISOString().slice(0, 7);

/**
 * Atomically use one unit of quota. Only increments if the key is still under
 * its limit, so concurrent requests can never push usage past the quota.
 */
export function consume(keyId, limit, period = currentPeriod()) {
  const d = db();
  const run = d.transaction(() => {
    d.prepare('INSERT OR IGNORE INTO usage (key_id, period, count) VALUES (?, ?, 0)').run(keyId, period);
    const r = d
      .prepare('UPDATE usage SET count = count + 1 WHERE key_id = ? AND period = ? AND count < ?')
      .run(keyId, period, limit);
    const { count } = d.prepare('SELECT count FROM usage WHERE key_id = ? AND period = ?').get(keyId, period);
    return { allowed: r.changes === 1, used: count, limit, period };
  });
  return run();
}

/** Give one unit back (used when a render fails, so errors don't cost the customer quota). */
export function refund(keyId, period = currentPeriod()) {
  db()
    .prepare('UPDATE usage SET count = count - 1 WHERE key_id = ? AND period = ? AND count > 0')
    .run(keyId, period);
}

export function getUsage(keyId, period = currentPeriod()) {
  return db().prepare('SELECT count FROM usage WHERE key_id = ? AND period = ?').get(keyId, period)?.count ?? 0;
}
