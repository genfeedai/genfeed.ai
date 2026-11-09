'use client';

import { ButtonVariant, CardPadding } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  creatorArticlePath,
} from '@genfeedai/contracts/constants';
import type { ICreatorArticleAccess } from '@genfeedai/contracts/interfaces/billing';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CreatorPaymentsService } from '@genfeedai/services/billing/creator-payments.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

const NEEDS_CREDITS_CODES: ReadonlySet<string> = new Set([
  'CREDIT_TRANSFER_REQUIRES_PURCHASE',
  'INSUFFICIENT_CREDITS',
]);

type Problem = 'failed' | 'needs-credits' | null;

/**
 * A paid article the reader came from (#9718), above the subscription card:
 * unlock it once, or see that a subscription is the way in. Renders nothing
 * without an article, or for an article everyone can read.
 */
export default function CreatorArticleUnlockCard() {
  const translate = useTranslations('pages.creatorArticleUnlock');
  const { orgSlug } = useRouteParams<{ orgSlug: string }>();
  const articleId = useSearchParams().get('article');
  const getService = useAuthedService(
    useCallback(
      (token: string) => CreatorPaymentsService.getInstance(token),
      [],
    ),
  );
  const [access, setAccess] = useState<ICreatorArticleAccess | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  useEffect(() => {
    if (!articleId) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const next = await service.getArticleAccess(
          articleId,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setAccess(next);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Loading article access failed', error);
        }
      }
    })();
    return () => controller.abort();
  }, [articleId, getService]);

  if (!access || access.accessLevel === 'public') {
    return null;
  }

  const unlock = async () => {
    setIsUnlocking(true);
    try {
      const service = await getService();
      setAccess((await service.unlockArticle(access.articleId)).access);
      setProblem(null);
    } catch (error) {
      logger.error('Unlocking the article failed', error);
      const code = getJsonApiErrorMember(error)?.code;
      setProblem(
        typeof code === 'string' && NEEDS_CREDITS_CODES.has(code)
          ? 'needs-credits'
          : 'failed',
      );
    } finally {
      setIsUnlocking(false);
    }
  };

  const article = access.label;
  const readHref = access.slug
    ? `${EnvironmentService.apps.website}${creatorArticlePath(access.handle, access.slug)}`
    : null;
  const readLink = readHref ? (
    <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
      <a href={readHref}>{translate('read')}</a>
    </Button>
  ) : null;

  if (access.hasAccess) {
    return (
      <Card
        padding={CardPadding.LG}
        label={translate('openTitle', { article })}
        description={translate('openDescription')}
      >
        {readLink}
      </Card>
    );
  }

  const price = access.unlockPriceCredits;
  if (price === null) {
    return (
      <Card
        padding={CardPadding.LG}
        label={translate('subscribersTitle', { article })}
        description={translate('subscribersDescription')}
      >
        {readLink}
      </Card>
    );
  }

  const creditsHref = orgSlug
    ? createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS)
    : APP_ROUTES.ROOT;
  return (
    <Card
      padding={CardPadding.LG}
      label={translate('unlockTitle', { article })}
      description={translate('unlockDescription', { price })}
    >
      <div className="flex flex-col gap-4">
        {problem === 'needs-credits' ? (
          <Alert>
            <AlertTitle>{translate('needCreditsTitle')}</AlertTitle>
            <AlertDescription>
              {translate('needCreditsDescription')}{' '}
              <Link href={creditsHref}>{translate('buyCredits')}</Link>
            </AlertDescription>
          </Alert>
        ) : problem ? (
          <Alert variant="destructive">
            <AlertDescription>{translate('failed')}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          variant={ButtonVariant.DEFAULT}
          isDisabled={isUnlocking}
          label={
            isUnlocking
              ? translate('unlocking')
              : translate('unlock', { price })
          }
          onClick={() => void unlock()}
        />
      </div>
    </Card>
  );
}
