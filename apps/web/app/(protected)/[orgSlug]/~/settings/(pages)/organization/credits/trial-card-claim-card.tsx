'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  TrialClaimOutcome,
  TrialClaimStatus,
} from '@genfeedai/contracts/interfaces/billing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StripeService } from '@services/billing/stripe.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { Gift } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrialCardClaimCardProps } from '@/features/settings/props/trial-card-claim-card.props';

const OUTCOME_MESSAGE_KEYS: Record<
  Exclude<TrialClaimOutcome, 'already-claimed' | 'granted'>,
  string
> = {
  'card-already-used': 'cardAlreadyUsed',
  'card-not-verified': 'cardNotVerified',
  'not-eligible': 'notEligible',
};

/**
 * Unlocks the free-trial credits against a saved card. Stripe Checkout in
 * setup mode saves the card without charging it; on return the server checks
 * the finished session and pays the credits once per card.
 */
export default function TrialCardClaimCard({
  onClaimed,
}: TrialCardClaimCardProps) {
  const translate = useTranslations('common.settings.creditsBalance.trialCard');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<TrialClaimStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // The claim effect must not restart (and abort its own request) when the
  // parent re-renders with a new callback identity.
  const onClaimedRef = useRef(onClaimed);
  const translateRef = useRef(translate);
  useEffect(() => {
    onClaimedRef.current = onClaimed;
    translateRef.current = translate;
  }, [onClaimed, translate]);

  const getStripeService = useAuthedService((token: string) =>
    StripeService.getInstance(token),
  );

  const returnedSessionId =
    searchParams.get('trialCard') === 'success'
      ? searchParams.get('session_id')
      : null;

  useEffect(() => {
    if (returnedSessionId) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getStripeService();
        const result = await service.getTrialCardStatus(controller.signal);
        if (!controller.signal.aborted) {
          setStatus(result.status);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load trial credit status', { error });
        }
      }
    })();
    return () => controller.abort();
  }, [getStripeService, returnedSessionId]);

  useEffect(() => {
    if (!returnedSessionId) {
      return;
    }
    const controller = new AbortController();
    setIsClaiming(true);
    void (async () => {
      try {
        const service = await getStripeService();
        const { outcome } = await service.claimTrialCard(
          returnedSessionId,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        if (outcome === 'granted' || outcome === 'already-claimed') {
          setStatus('claimed');
          if (outcome === 'granted') {
            NotificationsService.getInstance().success(
              translateRef.current('granted'),
            );
          }
          await onClaimedRef.current?.();
        } else {
          setStatus('claimable');
          NotificationsService.getInstance().error(
            translateRef.current(OUTCOME_MESSAGE_KEYS[outcome]),
          );
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to claim trial credits', { error });
        setStatus('claimable');
        NotificationsService.getInstance().error(
          translateRef.current('claimFailed'),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsClaiming(false);
          router.replace(pathname);
        }
      }
    })();
    return () => controller.abort();
  }, [getStripeService, pathname, returnedSessionId, router]);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      const service = await getStripeService();
      const result = await service.createTrialCardCheckout(
        window.location.pathname,
      );
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      throw new Error('Card setup did not return a URL');
    } catch (error) {
      logger.error('Failed to start trial card setup', { error });
      NotificationsService.getInstance().error(translate('startFailed'));
      setIsStarting(false);
    }
  }, [getStripeService, translate]);

  if (status !== 'claimable' && !isClaiming) {
    return null;
  }

  return (
    <Card data-testid="trial-card-claim">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gift aria-hidden="true" className="size-4" />
          </div>
          <div>
            <Text as="p" size="sm" weight="semibold">
              {translate('title')}
            </Text>
            <Text as="p" size="xs" color="muted">
              {translate('description')}
            </Text>
          </div>
        </div>
        <Button
          variant={ButtonVariant.DEFAULT}
          isLoading={isStarting || isClaiming}
          onClick={() => void handleStart()}
          withWrapper={false}
        >
          {translate('cta')}
        </Button>
      </div>
    </Card>
  );
}
