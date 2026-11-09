import { Router } from 'express';
import { auth } from '../middleware/auth.middleware.js';
import { perKeyLimit } from '../middleware/rateLimit.middleware.js';
import { validate, generateSchema } from '../middleware/validate.middleware.js';
import { TIERS } from '../config/tiers.js';
import { TEMPLATE_NAMES, render } from '../services/template.service.js';
import { renderPdf } from '../services/pdf.service.js';
import { getUsage, increment } from '../services/usage.service.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
router.use(auth, perKeyLimit);

router.get('/templates', (_req, res) => res.json({ templates: TEMPLATE_NAMES }));

router.get('/usage', (req, res) => {
  const tier = TIERS[req.client.tier];
  const used = getUsage(req.client.id);
  res.json({ tier: req.client.tier, used, limit: tier.monthlyQuota, remaining: Math.max(0, tier.monthlyQuota - used) });
});

router.post('/generate', validate(generateSchema), async (req, res, next) => {
  try {
    const tier = TIERS[req.client.tier];
    const used = getUsage(req.client.id);
    if (used >= tier.monthlyQuota) {
      throw new HttpError(402, 'quota_exceeded', `Monthly quota of ${tier.monthlyQuota} PDFs reached. Upgrade your plan.`);
    }

    const { template, data, html, options } = req.body;
    const source = template ? render(template, data) : html;
    const pdf = await renderPdf({ html: source, options, watermark: tier.watermark });

    increment(req.client.id); // only successful renders are billed
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="document.pdf"',
      'X-Usage-Remaining': String(Math.max(0, tier.monthlyQuota - used - 1)),
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

export default router;