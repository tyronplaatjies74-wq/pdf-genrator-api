import { z } from 'zod';
import { HttpError } from '../utils/httpError.js';

// 1. The validation middleware function
export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (err) {
    next(err);
  }
};

// 2. The signup schema your route uses
export const signupSchema = z.object({
  email: z.string().email('Invalid email address')
});

// 3. The checkout schema your route uses
export const checkoutSchema = z.object({
  tier: z.string()
});