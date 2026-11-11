import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.middleware.js';
import { withPage } from '../services/browserPool.service.js';

const router = Router();

const generateSchema = z
  .object({
    html: z.string().optional(),
    url: z.string().url('Invalid URL provided').optional(),
    options: z
      .object({
        format: z.string().optional(),
        landscape: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((d) => d.html || d.url, { message: 'Provide html or url' });

router.post('/generate', validate(generateSchema), async (req, res, next) => {
  try {
    const { html, url, options = {} } = req.body;

    const pdf = await withPage(async (page) => {
      if (html) {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      } else {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      }
      return page.pdf({
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
      });
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="document.pdf"',
    });
    res.send(Buffer.from(pdf));
  } catch (err) {
    next(err);
  }
});

export default router;