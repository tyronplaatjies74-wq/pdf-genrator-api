import { TIERS } from '../config/tiers.js';
import { HttpError } from '../utils/httpError.js';
import { consume } from '../services/usage.service.js';

// Runs after auth and validation. Reserves one PDF from the client's monthly quota.
export function quota(req, res, next) {
  const tier = TIERS[req.client.tier] ?? TIERS.free;
  const r = consume(req.client.id, tier.monthlyQuota);
  res.set({
    'X-Quota-Limit': String(r.limit),
    'X-Quota-Remaining': String(Math.max(0, r.limit - r.used)),
  });
  if (!r.allowed) {
    return next(
      new HttpError(402, 'quota_exceeded', `Monthly quota of ${r.limit} PDFs reached. Upgrade your plan or wait until next month.`),
    );
  }
  req.quotaPeriod = r.period; // so a failed render can refund the right month
  next();
}
