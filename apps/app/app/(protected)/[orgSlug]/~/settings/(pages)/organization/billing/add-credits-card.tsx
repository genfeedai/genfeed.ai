'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StripeService } from '@services/billing/stripe.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useState } from 'react';
import CreditTopUpPanel from '../credits/credit-top-up-panel';

export default function AddCreditsCard() {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const getStripeService = useAuthedService((token: string) =>
    StripeService.getInstance(token),
  );

  const handleAddCredits = async ({ credits }: { credits: number }) => {
    const paygPriceId = EnvironmentService.plans.payg;
    if (!paygPriceId) {
      NotificationsService.getInstance().error(
        'Credit top-ups are not available right now.',
      );
      return;
    }

    setIsStartingCheckout(true);

    try {
      const service = await getStripeService();
      const result = await service.createCheckoutSession({
        cancelUrl: window.location.href,
        quantity: credits,
        stripePriceId: paygPriceId,
        successUrl: `${window.location.origin}${window.location.pathname}?credits=success`,
      });

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      throw new Error('Checkout session did not return a URL');
    } catch (error) {
      logger.error('Failed to start credit top-up checkout', error);
      NotificationsService.getInstance().error(
        'Failed to start checkout. Please try again.',
      );
      setIsStartingCheckout(false);
    }
  };

  return (
    <CreditTopUpPanel
      description="Top up your hosted balance. 1 credit = $0.01."
      isStartingCheckout={isStartingCheckout}
      submitLabel="Add credit"
      onSubmit={handleAddCredits}
    />
  );
}
