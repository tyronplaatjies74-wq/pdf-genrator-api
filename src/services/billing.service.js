import Stripe from 'stripe';
import { env, stripeEnabled } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { setStripeCustomer, setTier } from './keys.service.js';
import { logger } from '../utils/logger.js';

let _stripe;
const stripe = () => (_stripe ??= new Stripe(env.STRIPE_SECRET_KEY));

const priceToTier = () =>
  Object.fromEntries(Object.entries(env.STRIPE_PRICES).map(([tier, price]) => [price, tier]));

export async function createCheckoutSession(client, tier) {
  if (!stripeEnabled()) throw new HttpError(501, 'billing_disabled', 'Billing is not configured');
  const price = env.STRIPE_PRICES[tier];
  if (!price) throw new HttpError(400, 'invalid_tier', 'Unknown tier');

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    customer: client.stripe_customer_id || undefined,
    customer_email: client.stripe_customer_id ? undefined : client.email,
    client_reference_id: client.id,
    success_url: env.CHECKOUT_SUCCESS_URL,
    cancel_url: env.CHECKOUT_CANCEL_URL,
  });
  return session.url;
}

export function constructEvent(rawBody, signature) {
  return stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

export function handleEvent(event) {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription' || !obj.client_reference_id) break;
      setStripeCustomer(obj.client_reference_id, obj.customer);
      // Tier is set by the subscription events below; subscription.created fires alongside this.
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const priceId = obj.items?.data?.[0]?.price?.id;
      const tier = priceToTier()[priceId];
      const active = ['active', 'trialing'].includes(obj.status);
      if (tier && active) setTier({ customerId: obj.customer, tier, subscriptionId: obj.id });
      else if (!active && obj.status !== 'incomplete') setTier({ customerId: obj.customer, tier: 'free', subscriptionId: null });
      break;
    }
    case 'customer.subscription.deleted':
      setTier({ customerId: obj.customer, tier: 'free', subscriptionId: null });
      break;
    default:
      logger.debug({ type: event.type }, 'ignored stripe event');
  }
}