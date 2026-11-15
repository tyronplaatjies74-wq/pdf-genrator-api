import { Router } from 'express';
import express from 'express';
import { auth } from '../middleware/auth.middleware.js';
import { perIpLimit } from '../middleware/rateLimit.middleware.js';
import { validate, signupSchema, checkoutSchema, verifySchema } from '../middleware/validate.middleware.js';
import { findByEmail, createPendingVerification, verifyTokenAndCreateKey } from '../services/keys.service.js';
import { sendVerificationEmail } from '../services/email.service.js';
import { createCheckoutSession, constructEvent, handleEvent } from '../services/billing.service.js';
import { stripeEnabled } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { TIERS } from '../config/tiers.js';
import { logger } from '../utils/logger.js';

export const accountRouter = Router();

// Public: powers the pricing table on the landing page, so tiers.js stays the single source of truth.
accountRouter.get('/plans', (_req, res) =>
  res.json({ plans: Object.entries(TIERS).map(([id, t]) => ({ id, ...t })) }));

// Step 1: Request email verification link instead of immediately minting a key
accountRouter.post('/signup', perIpLimit(5), validate(signupSchema), async (req, res, next) => {
  try {
    if (findByEmail(req.body.email)) {
      throw new HttpError(409, 'email_exists', 'An account already exists for this email');
    }
    const token = createPendingVerification(req.body.email);
    await sendVerificationEmail(req.body.email, token);

    res.status(200).json({ 
      message: 'Verification email sent. Please check your inbox to activate your API key.' 
    });
  } catch (err) {
    next(err);
  }
});

// Step 2: the verify page calls this when the person clicks "Reveal my API key".
// It is a POST (not a GET link) so email scanners that pre-open links cannot use up the token.
accountRouter.post('/verify', perIpLimit(10), validate(verifySchema), (req, res, next) => {
  try {
    const { key, tier } = verifyTokenAndCreateKey(req.body.token);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ 
      apiKey: key, 
      tier, 
      note: 'Store this key now; it cannot be shown again.' 
    });
  } catch (err) {
    next(err);
  }
});

accountRouter.post('/billing/checkout', auth, validate(checkoutSchema), async (req, res, next) => {
  try {
    res.json({ url: await createCheckoutSession(req.client, req.body.tier) });
  } catch (err) {
    next(err);
  }
});

// Mounted in app.js BEFORE express.json(): Stripe needs the raw body to verify signatures.
export const webhookRouter = Router();
webhookRouter.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripeEnabled()) return res.status(501).end();
  let event;
  try {
    event = constructEvent(req.body, req.get('stripe-signature'));
  } catch (err) {
    logger.warn({ err: err.message }, 'bad stripe signature');
    return res.status(400).send('Invalid signature');
  }
  try {
    handleEvent(event);
    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, 'stripe handler failed');
    res.status(500).end(); // Stripe will retry
  }
});
