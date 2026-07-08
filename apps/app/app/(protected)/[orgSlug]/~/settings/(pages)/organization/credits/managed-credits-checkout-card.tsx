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
      description="Buy hosted image-generation credits and provision one managed key for this self-hosted install."
      helperContent={
        <section
          className="max-w-xl space-y-3"
          aria-labelledby="provisioning-email-heading"
        >
          <div className="space-y-1">
            <h3
              id="provisioning-email-heading"
              className="text-2xl font-semibold tracking-normal text-foreground"
            >
              Provisioning email
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Checkout and the managed key receipt will be sent here.
            </p>
          </div>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-label="Provisioning email"
          />
        </section>
      }
      isStartingCheckout={isStartingCheckout}
      submitLabel="Get credits"
      onSubmit={handleStartCheckout}
    />
  );
}
