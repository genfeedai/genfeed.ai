'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Why an X post did not go out, and the way to fix it. X bills every post, so
 * each one costs credits and an empty wallet cannot send it. The person buys
 * credits, then publishes the post again. The plans page is the second button
 * because a plan raises the daily limits.
 */
export default function ReleaseXPostingBillingCard(): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release.xPostingBilling');
  const { orgHref } = useOrgUrl();

  return (
    <div className="flex flex-col gap-3">
      <Alert size="sm" variant="warning">
        <AlertTitle>{translate('creditsTitle')}</AlertTitle>
        <AlertDescription>{translate('creditsDescription')}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
          <Link href={orgHref(APP_ROUTES.SETTINGS.CREDITS)}>
            {translate('creditsAction')}
          </Link>
        </Button>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.SECONDARY}>
          <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
            {translate('plansAction')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
