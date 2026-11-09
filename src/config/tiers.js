// Edit these to change your pricing. Prices themselves live in Stripe.
export const TIERS = {
  free:     { label: 'Free',     monthlyQuota: 100,   requestsPerMinute: 10,  watermark: true,  priceUsd: 0 },
  starter:  { label: 'Starter',  monthlyQuota: 2000,  requestsPerMinute: 60,  watermark: false, priceUsd: 15 },
  pro:      { label: 'Pro',      monthlyQuota: 10000, requestsPerMinute: 180, watermark: false, priceUsd: 49 },
  business: { label: 'Business', monthlyQuota: 50000, requestsPerMinute: 600, watermark: false, priceUsd: 149 },
};