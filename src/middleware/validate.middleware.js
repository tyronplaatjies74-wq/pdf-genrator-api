import { z } from 'zod';
import { HttpError } from '../utils/httpError.js';

// Checks req.body against a zod schema. Bad input gets a clean 400 (never a 500),
// and the cleaned-up result (trimmed, lower-cased, unknown fields removed) replaces req.body.
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const message = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    return next(new HttpError(400, 'invalid_request', message));
  }
  req.body = result.data;
  next();
};

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').max(254, 'Email is too long'),
});

export const checkoutSchema = z.object({
  tier: z.string().min(1, 'Tier is required').max(32),
});
