'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ButtonVariant } from '@genfeedai/enums';
import { ManagedCreditsService } from '@services/billing/managed-credits.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useEffect, useState } from 'react';
import { HiOutlineCreditCard, HiOutlineKey } from 'react-icons/hi2';

const DEFAULT_CREDIT_PACK = 1000;

function parseCredits(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export default function ManagedCreditsCheckoutCard() {
  const { currentUser } = useCurrentUser();
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [credits, setCredits] = useState(String(DEFAULT_CREDIT_PACK));
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  useEffect(() => {
    if (currentUser?.email) {
      setEmail((previousEmail) => previousEmail || currentUser.email || '');
    }
  }, [currentUser?.email]);

  const handleStartCheckout = async () => {
    const normalizedEmail = email.trim();
    const quantity = parseCredits(credits);

    if (!normalizedEmail || !quantity) {
      NotificationsService.getInstance().error(
        'Add a valid email and credit quantity before checkout.',
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
        quantity,
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
    <Card className="p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60">
              <HiOutlineKey className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Genfeed managed credits</h3>
              <p className="text-xs text-muted-foreground">
                Buy hosted image-generation credits and copy one managed key
                into this self-hosted install.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">
                Provisioning email
              </span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">
                Credits
              </span>
              <Input
                type="number"
                min={1}
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
              />
            </div>
          </div>
        </div>

        <Button
          variant={ButtonVariant.DEFAULT}
          onClick={handleStartCheckout}
          isDisabled={isStartingCheckout}
          className="w-full shrink-0 lg:mt-8 lg:w-auto"
        >
          <HiOutlineCreditCard className="size-4" />
          {isStartingCheckout ? 'Opening checkout...' : 'Get Credits'}
        </Button>
      </div>
    </Card>
  );
}
