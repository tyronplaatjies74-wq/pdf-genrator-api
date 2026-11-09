import crypto from 'node:crypto';
import { db } from './db.service.js';
import { HttpError } from '../utils/httpError.js';

const hash = (key) => crypto.createHash('sha256').update(key).digest('hex');

export function createKey({ email, tier = 'free' }) {
  const key = 'pk_live_' + crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomUUID();
  db()
    .prepare('INSERT INTO api_keys (id, key_hash, key_prefix, email, tier) VALUES (?, ?, ?, ?, ?)')
    .run(id, hash(key), key.slice(0, 12), email.toLowerCase(), tier);
  return { id, key, tier };
}

export function findByKey(key) {
  return db().prepare('SELECT * FROM api_keys WHERE key_hash = ? AND active = 1').get(hash(key));
}

export function findByEmail(email) {
  return db().prepare('SELECT * FROM api_keys WHERE email = ?').get(email.toLowerCase());
}

export function createPendingVerification(email) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15-minute expiration

  db()
    .prepare('INSERT OR REPLACE INTO pending_verifications (token, email, expires_at) VALUES (?, ?, ?)')
    .run(token, email.toLowerCase(), expiresAt);

  return token;
}

export function verifyTokenAndCreateKey(token) {
  const row = db().prepare('SELECT * FROM pending_verifications WHERE token = ?').get(token);

  if (!row) {
    throw new HttpError(400, 'invalid_token', 'Verification link is invalid.');
  }

  if (Date.now() > row.expires_at) {
    db().prepare('DELETE FROM pending_verifications WHERE token = ?').run(token);
    throw new HttpError(400, 'token_expired', 'Verification link has expired. Please sign up again.');
  }

  if (findByEmail(row.email)) {
    db().prepare('DELETE FROM pending_verifications WHERE token = ?').run(token);
    throw new HttpError(409, 'email_exists', 'An account already exists for this email');
  }

  const result = createKey({ email: row.email });
  db().prepare('DELETE FROM pending_verifications WHERE token = ?').run(token);

  return result;
}

export function setStripeCustomer(id, customerId) {
  db().prepare('UPDATE api_keys SET stripe_customer_id = ? WHERE id = ?').run(customerId, id);
}

export function setTier({ keyId, customerId, tier, subscriptionId }) {
  if (keyId) {
    db().prepare('UPDATE api_keys SET tier = ?, stripe_subscription_id = ?, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?')
      .run(tier, subscriptionId ?? null, customerId ?? null, keyId);
  } else if (customerId) {
    db().prepare('UPDATE api_keys SET tier = ?, stripe_subscription_id = ? WHERE stripe_customer_id = ?')
      .run(tier, subscriptionId ?? null, customerId);
  }
}