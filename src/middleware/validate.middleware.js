import { z } from 'zod';
import { TEMPLATE_NAMES } from '../services/template.service.js';
import { HttpError } from '../utils/httpError.js';

const cssLength = z.string().regex(/^\d+(\.\d+)?(mm|cm|in|px)$/);

export const generateSchema = z
  .object({
    template: z.string().refine((t) => TEMPLATE_NAMES.includes(t), 'unknown template').optional(),
    data: z.record(z.any()).optional(),
    html: z.string().min(1).max(1_000_000).optional(),
    options: z
      .object({
        format: z.enum(['A4', 'A5', 'Letter', 'Legal']).optional(),
        landscape: z.boolean().optional(),
        margin: z.object({ top: cssLength, right: cssLength, bottom: cssLength, left: cssLength }).partial().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => Boolean(b.template) !== Boolean(b.html), { message: 'Provide exactly one of "template" or "html"' });

export const signupSchema = z.object({ email: z.string().email().max(254) }).strict();
export const checkoutSchema = z.object({ tier: z.enum(['starter', 'pro', 'business']) }).strict();

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return next(new HttpError(400, 'invalid_request', msg));
  }
  req.body = result.data;
  next();
};