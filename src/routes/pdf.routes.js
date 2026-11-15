import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.middleware.js';
import { quota } from '../middleware/quota.middleware.js';
import { withPage } from '../services/browserPool.service.js';
import { refund } from '../services/usage.service.js';
import { assertPublicUrl } from '../services/urlGuard.service.js';
import { TIERS } from '../config/tiers.js';

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

// Free-tier footer. It uses Chromium's footer template, which sits outside the page,
// so customer HTML/CSS can't hide or restyle it. The bottom margin leaves room for it.
const FREE_TIER_PDF_OPTIONS = {
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font-size:9px;font-family:sans-serif;color:#777;text-align:center;">Made with PDF API · Free plan</div>',
  margin: { bottom: '18mm' },
};

router.post('/generate', validate(generateSchema), quota, async (req, res, next) => {
  const tier = TIERS[req.client.tier] ?? TIERS.free;
  try {
    const { html, url, options = {} } = req.body;
    if (!html) await assertPublicUrl(url); // 400 for private/internal/non-http URLs, before any rendering

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
        ...(tier.watermark ? FREE_TIER_PDF_OPTIONS : {}),
      });
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="document.pdf"',
    });
    res.send(Buffer.from(pdf));
  } catch (err) {
    refund(req.client.id, req.quotaPeriod); // failed renders don't cost the customer quota
    next(err);
  }
});

export default router;
