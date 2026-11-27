'use client';

import type { CreateCheckoutSessionDto } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StripeService } from '@services/billing/stripe.service';
import { useCallback } from 'react';

type StartCheckoutInput = Required<
  Pick<CreateCheckoutSessionDto, 'quantity' | 'successUrl'>
> & {
  cancelUrl?: string;
  stripePriceId: string;
};

/**
 * Opens Stripe Checkout for the current organization: a plan (`quantity`
 * null, one seat of a fixed price) or a credit pack (`quantity` = credits).
 * Resolves only on failure, since a session sends the browser away; the
 * caller shows its own error. Shared by the subscription and credits settings
 * and the plan choice after onboarding, so all three open the same checkout.
 */
export function useStartCheckout(): (
  input: StartCheckoutInput,
) => Promise<void> {
  const getStripeService = useAuthedService((token: string) =>
    StripeService.getInstance(token),
  );

  return useCallback(
    async ({ cancelUrl, quantity, stripePriceId, successUrl }) => {
      const service = await getStripeService();
      const result = await service.createCheckoutSession({
        cancelUrl: cancelUrl ?? window.location.href,
        quantity,
        stripePriceId,
        successUrl,
      });

      if (!result?.url) {
        throw new Error('Checkout session did not return a URL');
      }

      window.location.href = result.url;
    },
    [getStripeService],
  );
}
