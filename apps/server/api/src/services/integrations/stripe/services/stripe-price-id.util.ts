const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;

export function isStripePriceId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_PRICE_ID_PATTERN.test(value);
}
