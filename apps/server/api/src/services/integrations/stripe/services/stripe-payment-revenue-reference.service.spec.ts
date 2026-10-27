import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { StripePaymentRevenueReferenceService } from '@api/services/integrations/stripe/services/stripe-payment-revenue-reference.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function build(overrides: {
  invoicePayments?: unknown[];
  paymentIntent?: unknown;
}) {
  const stripe = {
    invoicePayments: {
      list: vi
        .fn()
        .mockResolvedValue({ data: overrides.invoicePayments ?? [] }),
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue(overrides.paymentIntent),
    },
  };
  const service = new StripePaymentRevenueReferenceService(
    { stripe } as unknown as StripeService,
    { error: vi.fn() } as unknown as LoggerService,
  );
  return { service, stripe };
}

const settledIntent = {
  latest_charge: { balance_transaction: { currency: 'usd', fee: 131 } },
};

describe('StripePaymentRevenueReferenceService.resolveProcessingFee', () => {
  it('reads the fee from the charge balance transaction of a payment intent', async () => {
    const { service } = build({ paymentIntent: settledIntent });

    await expect(
      service.resolveProcessingFee({ paymentIntentId: 'pi_1' }),
    ).resolves.toEqual({ currency: 'usd', feeMinor: 131 });
  });

  it('finds the payment intent of a subscription invoice first', async () => {
    const { service, stripe } = build({
      invoicePayments: [{ payment: { payment_intent: 'pi_9' } }],
      paymentIntent: settledIntent,
    });

    await expect(
      service.resolveProcessingFee({ invoiceId: 'in_1' }),
    ).resolves.toEqual({ currency: 'usd', feeMinor: 131 });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_9', {
      expand: ['latest_charge.balance_transaction'],
    });
  });

  it('returns null while the charge has no balance transaction', async () => {
    const { service } = build({
      paymentIntent: { latest_charge: { balance_transaction: null } },
    });

    await expect(
      service.resolveProcessingFee({ paymentIntentId: 'pi_2' }),
    ).resolves.toBeNull();
  });

  it('returns null for an invoice that was settled without a payment intent', async () => {
    const { service } = build({ invoicePayments: [] });

    await expect(
      service.resolveProcessingFee({ invoiceId: 'in_2' }),
    ).resolves.toBeNull();
  });
});
