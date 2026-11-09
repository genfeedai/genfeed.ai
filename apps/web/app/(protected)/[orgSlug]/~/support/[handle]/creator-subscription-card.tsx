'use client';

import {
  ButtonVariant,
  CardPadding,
  CreatorSubscriptionStatus,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type {
  ICreatorSubscriptionOffer,
  ICreatorSubscriptionSummary,
} from '@genfeedai/contracts/interfaces/billing';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CreatorPaymentsService } from '@genfeedai/services/billing/creator-payments.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

const LEADING_AT_PATTERN = /^@/;
const PERIOD_END_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
});
const NEEDS_CREDITS_CODES: ReadonlySet<string> = new Set([
  'CREDIT_TRANSFER_REQUIRES_PURCHASE',
  'INSUFFICIENT_CREDITS',
]);

type Problem = 'failed' | 'needs-credits' | 'own-team' | null;

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function readProblem(error: unknown): Exclude<Problem, null> {
  const code = getJsonApiErrorMember(error)?.code;
  if (typeof code === 'string' && NEEDS_CREDITS_CODES.has(code)) {
    return 'needs-credits';
  }
  return code === 'SUBSCRIBE_TO_OWN_TEAM' ? 'own-team' : 'failed';
}

/**
 * Paid subscription to a creator (#9717), above the tip form on the support
 * page. Renders nothing when the creator offers no paid subscription and the
 * reader has none.
 */
export default function CreatorSubscriptionCard() {
  const translate = useTranslations('pages.creatorSubscription');
  const { handle: rawHandle, orgSlug } = useRouteParams<{
    handle: string;
    orgSlug: string;
  }>();
  const handle = decodeURIComponent(rawHandle ?? '').replace(
    LEADING_AT_PATTERN,
    '',
  );
  const getService = useAuthedService(
    useCallback(
      (token: string) => CreatorPaymentsService.getInstance(token),
      [],
    ),
  );
  const [offer, setOffer] = useState<ICreatorSubscriptionOffer | null>(null);
  const [creatorLabel, setCreatorLabel] = useState(`@${handle}`);
  const [isBusy, setIsBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  // One key per intended subscribe: a double click or a retry charges once.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const [nextOffer, target] = await Promise.all([
          service.getSubscriptionOffer(handle, controller.signal),
          service.getTipTarget(handle, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setOffer(nextOffer);
          setCreatorLabel(target.label);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Loading the subscription offer failed', error);
        }
      }
    })();
    return () => controller.abort();
  }, [getService, handle]);

  const creditsHref = orgSlug
    ? createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS)
    : APP_ROUTES.ROOT;

  const applySubscription = (subscription: ICreatorSubscriptionSummary) => {
    setOffer((current) => (current ? { ...current, subscription } : current));
    setProblem(null);
  };

  const subscribe = async () => {
    setIsBusy(true);
    try {
      const service = await getService();
      applySubscription(await service.subscribe({ handle, idempotencyKey }));
      setIdempotencyKey(newIdempotencyKey());
    } catch (error) {
      logger.error('Subscribing failed', error);
      setProblem(readProblem(error));
    } finally {
      setIsBusy(false);
    }
  };

  const setCancelAtPeriodEnd = async (
    subscription: ICreatorSubscriptionSummary,
    cancelAtPeriodEnd: boolean,
  ) => {
    setIsBusy(true);
    try {
      const service = await getService();
      applySubscription(
        await service.setCancelAtPeriodEnd(subscription.id, cancelAtPeriodEnd),
      );
    } catch (error) {
      logger.error('Updating the subscription failed', error);
      setProblem('failed');
    } finally {
      setIsBusy(false);
    }
  };

  if (!offer || (!offer.subscription && offer.monthlyPriceCredits === null)) {
    return null;
  }

  const problemAlert =
    problem === 'needs-credits' ? (
      <Alert>
        <AlertTitle>{translate('needCreditsTitle')}</AlertTitle>
        <AlertDescription>
          {translate('needCreditsDescription')}{' '}
          <Link href={creditsHref}>{translate('buyCredits')}</Link>
        </AlertDescription>
      </Alert>
    ) : problem ? (
      <Alert variant="destructive">
        <AlertDescription>
          {translate(problem === 'own-team' ? 'ownTeam' : 'failed')}
        </AlertDescription>
      </Alert>
    ) : null;

  const { subscription } = offer;
  if (subscription) {
    const date = PERIOD_END_FORMAT.format(
      new Date(subscription.currentPeriodEnd),
    );
    return (
      <Card
        padding={CardPadding.LG}
        label={translate('subscribedTitle', { creator: creatorLabel })}
      >
        <div className="flex flex-col gap-4">
          <Text as="p" size="sm" color="muted">
            {subscription.cancelAtPeriodEnd
              ? translate('ends', { date })
              : translate('renews', {
                  date,
                  price: subscription.priceCredits,
                })}
          </Text>
          {subscription.status === CreatorSubscriptionStatus.PAST_DUE ? (
            <Alert variant="warning">
              <AlertTitle>{translate('pastDueTitle')}</AlertTitle>
              <AlertDescription>
                {translate('pastDueDescription')}{' '}
                <Link href={creditsHref}>{translate('buyCredits')}</Link>
              </AlertDescription>
            </Alert>
          ) : null}
          {problemAlert}
          <Button
            variant={ButtonVariant.SECONDARY}
            isDisabled={isBusy}
            label={
              isBusy
                ? translate('updating')
                : translate(subscription.cancelAtPeriodEnd ? 'keep' : 'cancel')
            }
            onClick={() =>
              void setCancelAtPeriodEnd(
                subscription,
                !subscription.cancelAtPeriodEnd,
              )
            }
          />
        </div>
      </Card>
    );
  }

  const price = offer.monthlyPriceCredits ?? 0;
  return (
    <Card
      padding={CardPadding.LG}
      label={translate('title', { creator: creatorLabel })}
      description={translate('description', { price })}
    >
      <div className="flex flex-col gap-4">
        {problemAlert}
        <Button
          variant={ButtonVariant.DEFAULT}
          isDisabled={isBusy}
          label={
            isBusy
              ? translate('subscribing')
              : translate('subscribe', { price })
          }
          onClick={() => void subscribe()}
        />
      </div>
    </Card>
  );
}
