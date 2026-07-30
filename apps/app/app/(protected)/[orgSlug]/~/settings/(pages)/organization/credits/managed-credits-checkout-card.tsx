'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ManagedCreditsService } from '@services/billing/managed-credits.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Input } from '@ui/primitives/input';
import { useEffect, useState } from 'react';
import CreditTopUpPanel from './credit-top-up-panel';

export default function ManagedCreditsCheckoutCard() {
  const { currentUser } = useCurrentUser();
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  useEffect(() => {
    if (currentUser?.email) {
      setEmail((previousEmail) => previousEmail || currentUser.email || '');
    }
  }, [currentUser?.email]);

  const handleStartCheckout = async ({ credits }: { credits: number }) => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      NotificationsService.getInstance().error(
        'Add a valid email before checkout.',
      );
      return;
    }

    setIsStartingCheckout(true);

    try {
      const result = await ManagedCreditsService.createCheckoutSession({
        cancelUrl: window.location.href,
        email: normalizedEmail,
        firstName: currentUser?.firstName || undefined,
        lastName: currentUser?.lastName || undefined,
        quantity: credits,
        successUrl: `${window.location.origin}/managed-credits/success?session_id={CHECKOUT_SESSION_ID}`,
      });

      window.location.href = result.url;
    } catch (error) {
      logger.error('Failed to start managed credits checkout', error);
      NotificationsService.getInstance().error(
        'Failed to start managed credits checkout.',
      );
      setIsStartingCheckout(false);
    }
  };

  return (
    <CreditTopUpPanel
      title="Buy credits"
      helperContent={
        <div className="space-y-2">
          <label
            htmlFor="provisioning-email"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Receipt email
          </label>
          <Input
            id="provisioning-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-label="Provisioning email"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Checkout and the managed key receipt are sent here.
          </p>
        </div>
      }
      isSubmitDisabled={!email.trim()}
      isStartingCheckout={isStartingCheckout}
      submitLabel="Get credits"
      onSubmit={handleStartCheckout}
    />
  );
}
