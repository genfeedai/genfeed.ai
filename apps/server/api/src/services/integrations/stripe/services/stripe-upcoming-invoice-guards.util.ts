import {
  StripeUpcomingInvoiceError,
  StripeUpcomingInvoiceErrorCode,
} from '@api/services/integrations/stripe/services/stripe-upcoming-invoice.error';
import type Stripe from 'stripe';

const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;

/**
 * Input checks for `StripeService.getUpcomingInvoice` that need no Stripe
 * call. Each failure names its cause so the subscriptions preview can map it
 * to a public code without parsing the message.
 */
export function assertUpcomingInvoiceRequest(
  currentPriceId: string,
  newPriceId: string,
  quantity: number | undefined,
): void {
  if (!STRIPE_PRICE_ID_PATTERN.test(currentPriceId)) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.INVALID_PRICE_ID,
      'Invalid current Stripe price ID',
    );
  }
  if (!STRIPE_PRICE_ID_PATTERN.test(newPriceId)) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.INVALID_PRICE_ID,
      'Invalid Stripe price ID',
    );
  }
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.INVALID_QUANTITY,
      'Subscription quantity must be a positive integer',
    );
  }
}

/**
 * Picks the subscription item that carries the persisted current price, after
 * proving the Stripe subscription belongs to the requested customer.
 */
export function resolveUpcomingInvoiceSubscriptionItem(
  subscription: Stripe.Subscription,
  customerId: string,
  currentPriceId: string,
): Stripe.SubscriptionItem {
  const subscriptionCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
  if (subscriptionCustomerId !== customerId) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.CUSTOMER_MISMATCH,
      'Stripe subscription does not belong to the requested customer',
    );
  }

  const items = subscription.items.data;
  if (items.length === 0) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.SUBSCRIPTION_ITEM_MISSING,
      'No subscription items found',
    );
  }
  if (items.every((item) => !item.price?.id)) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.SUBSCRIPTION_ITEM_MISSING,
      'No price found for subscription item',
    );
  }
  const subscriptionItem = items.find(
    (item) => item.price?.id === currentPriceId,
  );
  if (!subscriptionItem?.id) {
    throw new StripeUpcomingInvoiceError(
      StripeUpcomingInvoiceErrorCode.SUBSCRIPTION_ITEM_MISSING,
      'No subscription item found for current Stripe price',
    );
  }
  return subscriptionItem;
}
