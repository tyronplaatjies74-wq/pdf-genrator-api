const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true');
const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

const e = process.env;

export const env = {
  NODE_ENV: e.NODE_ENV || 'development',
  PORT: int(e.PORT, 3000),
  LOG_LEVEL: e.LOG_LEVEL || 'info',
  DATABASE_PATH: e.DATABASE_PATH || './data/app.db',
  // Public address of this service, used to build links in emails, e.g. https://api.yourdomain.co.za
  APP_URL: (e.APP_URL || '').replace(/\/+$/, ''),

  CHROME_PATH: e.CHROME_PATH || undefined,
  CHROME_NO_SANDBOX: bool(e.CHROME_NO_SANDBOX, false),
  BROWSER_POOL_SIZE: int(e.BROWSER_POOL_SIZE, 2),
  BROWSER_RECYCLE_AFTER: int(e.BROWSER_RECYCLE_AFTER, 200),
  MAX_CONCURRENT_RENDERS: int(e.MAX_CONCURRENT_RENDERS, 6),
  RENDER_TIMEOUT_MS: int(e.RENDER_TIMEOUT_MS, 20000),
  QUEUE_TIMEOUT_MS: int(e.QUEUE_TIMEOUT_MS, 10000),

  STRIPE_SECRET_KEY: e.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: e.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PRICES: {
    starter: e.STRIPE_PRICE_STARTER || '',
    pro: e.STRIPE_PRICE_PRO || '',
    business: e.STRIPE_PRICE_BUSINESS || '',
  },
  CHECKOUT_SUCCESS_URL: e.CHECKOUT_SUCCESS_URL || '',
  CHECKOUT_CANCEL_URL: e.CHECKOUT_CANCEL_URL || '',
};

export function validateEnv() {
  const errors = [];
  for (const k of ['PORT', 'BROWSER_POOL_SIZE', 'BROWSER_RECYCLE_AFTER', 'MAX_CONCURRENT_RENDERS', 'RENDER_TIMEOUT_MS', 'QUEUE_TIMEOUT_MS']) {
    if (!Number.isInteger(env[k]) || env[k] <= 0) errors.push(`${k} must be a positive integer`);
  }
  if (env.NODE_ENV === 'production' && !env.APP_URL) {
    errors.push('APP_URL is required in production (it is used in verification emails), e.g. https://api.yourdomain.co.za');
  }
  if (env.STRIPE_SECRET_KEY) {
    if (!env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set');
    for (const [tier, id] of Object.entries(env.STRIPE_PRICES)) {
      if (!id) errors.push(`STRIPE_PRICE_${tier.toUpperCase()} is required when STRIPE_SECRET_KEY is set`);
    }
    if (!env.CHECKOUT_SUCCESS_URL || !env.CHECKOUT_CANCEL_URL) errors.push('CHECKOUT_SUCCESS_URL and CHECKOUT_CANCEL_URL are required for billing');
  }
  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
  }
}

export const stripeEnabled = () => Boolean(env.STRIPE_SECRET_KEY);
