import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useState } from 'react';
import type { AddCreditsCardProps } from '@/features/settings/props/add-credits-card.props';
import { useStartCheckout } from '@/hooks/data/subscription/use-start-checkout/use-start-checkout';
import CreditTopUpPanel from '../credits/credit-top-up-panel';

export default function AddCreditsCard({
  secondaryAction,
}: AddCreditsCardProps) {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const openCheckout = useStartCheckout();

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
      await openCheckout({
        quantity: credits,
        stripePriceId: paygPriceId,
        successUrl: `${window.location.origin}${window.location.pathname}?credits=success`,
      });
    } catch (error) {
      const isForbidden =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status?: number }).status === 403;

      logger.error('Failed to start credit top-up checkout', {
        error,
        reportToSentry: !isForbidden,
      });
      NotificationsService.getInstance().error(
        isForbidden
          ? "Checkout isn't available for this workspace."
          : 'Failed to start checkout. Please try again.',
      );
      setIsStartingCheckout(false);
    }
  };

  return (
    <CreditTopUpPanel
      isStartingCheckout={isStartingCheckout}
      secondaryAction={secondaryAction}
      submitLabel="Add credit"
      onSubmit={handleAddCredits}
    />
  );
}
