import { findByKey } from '../services/keys.service.js';
import { HttpError } from '../utils/httpError.js';

export function auth(req, _res, next) {
  const header = req.get('authorization');
  const key = req.get('x-api-key') || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!key) return next(new HttpError(401, 'missing_api_key', 'Provide an API key via X-API-Key or Authorization: Bearer'));
  const client = findByKey(key);
  if (!client) return next(new HttpError(401, 'invalid_api_key', 'Invalid API key'));
  req.client = client;
  next();
}