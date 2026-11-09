import { TIERS } from '../config/tiers.js';
import { HttpError } from '../utils/httpError.js';

// Fixed-window counters in memory. Fine for one instance; swap for Redis when you scale out.
const windows = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (w.reset <= now) windows.delete(k);
}, 60_000).unref();

export function limiter({ keyFn, limitFn, windowMs = 60_000 }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const limit = limitFn(req);
    const now = Date.now();
    let w = windows.get(key);
    if (!w || w.reset <= now) {
      w = { count: 0, reset: now + windowMs };
      windows.set(key, w);
    }
    w.count++;
    res.set({
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(0, limit - w.count)),
    });
    if (w.count > limit) {
      res.set('Retry-After', String(Math.ceil((w.reset - now) / 1000)));
      return next(new HttpError(429, 'rate_limited', 'Too many requests'));
    }
    next();
  };
}

export const perKeyLimit = limiter({
  keyFn: (req) => `key:${req.client.id}`,
  limitFn: (req) => TIERS[req.client.tier]?.requestsPerMinute ?? TIERS.free.requestsPerMinute,
});

export const perIpLimit = (limit) =>
  limiter({ keyFn: (req) => `ip:${req.ip}:${req.path}`, limitFn: () => limit });