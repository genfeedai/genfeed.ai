import { projectStripeSystemEvent } from '@api/services/system-events/system-event-projection';
import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

function event(type: string, object: unknown, live = true): Stripe.Event {
  return {
    id: 'evt_1',
    type,
    created: 1_800_000_000,
    livemode: live,
    data: { object },
  } as Stripe.Event;
}
describe('system billing events', () => {
  it('preserves free credits without classifying subscription checkout as another payment', () => {
    expect(
      projectStripeSystemEvent(
        event('checkout.session.completed', {
          id: 'cs_1',
          mode: 'payment',
          payment_status: 'no_payment_required',
          currency: 'usd',
          amount_total: 0,
          metadata: { plan_type: 'payg', credits: '1000' },
        }),
      ),
    ).toMatchObject({
      type: 'credits.purchased',
      data: { amountMinor: 0, credits: 1000 },
    });
    expect(
      projectStripeSystemEvent(
        event('checkout.session.completed', {
          mode: 'subscription',
          payment_status: 'paid',
        }),
      ),
    ).toBeNull();
  });
  it('projects payment failures and lifecycle changes independently of collections', () => {
    expect(
      projectStripeSystemEvent(
        event('invoice.payment_failed', {
          id: 'in_2',
          subscription: 'sub_1',
          amount_due: 4900,
          amount_paid: 0,
          currency: 'usd',
          customer: 'cus_1',
        }),
      ),
    ).toMatchObject({ type: 'payment.failed', data: { amountMinor: 4900 } });
    for (const [type, projected] of [
      ['customer.subscription.created', 'subscription.created'],
      ['customer.subscription.updated', 'subscription.updated'],
      ['customer.subscription.deleted', 'subscription.canceled'],
    ]) {
      const output = projectStripeSystemEvent(
        event(type, {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          cancel_at_period_end: true,
        }),
      );
      expect(output).toMatchObject({
        type: projected,
        data: { cancelAtPeriodEnd: true },
      });
      expect(output?.data.amountMinor).toBeUndefined();
    }
  });
  it('excludes test-mode, unpaid and unrelated checkout events', () => {
    expect(
      projectStripeSystemEvent(
        event('customer.subscription.created', {}, false),
      ),
    ).toBeNull();
    expect(
      projectStripeSystemEvent(
        event('checkout.session.completed', {
          mode: 'payment',
          payment_status: 'unpaid',
          metadata: { plan_type: 'payg' },
        }),
      ),
    ).toBeNull();
    expect(
      projectStripeSystemEvent(
        event('checkout.session.completed', {
          mode: 'payment',
          payment_status: 'paid',
          metadata: { type: 'skills-pro' },
        }),
      ),
    ).toBeNull();
  });
  it('projects subscription invoice actual payment without copying customer/payment details', () => {
    const output = projectStripeSystemEvent(
      event('invoice.paid', {
        id: 'in_1',
        amount_paid: 4900,
        amount_due: 5000,
        currency: 'usd',
        customer: 'cus_1',
        customer_email: 'private@example.com',
        parent: { subscription_details: { subscription: 'sub_1' } },
      }),
    );
    expect(output?.data).toEqual({
      objectId: 'in_1',
      amountMinor: 4900,
      currency: 'usd',
      customerId: 'cus_1',
    });
  });
});
