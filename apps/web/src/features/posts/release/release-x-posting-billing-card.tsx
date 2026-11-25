'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  X_POSTING_REQUIRES_PAID_PLAN_CODE,
  type XPostingBillingErrorCode,
} from '@genfeedai/contracts/api-types/contracts/x-posting-billing.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface ReleaseXPostingBillingCardProps {
  code: XPostingBillingErrorCode;
}

/**
 * Why an X post did not go out, and the one way to fix it. X bills every post,
 * so the free plan cannot post and a paid plan pays in credits; the person
 * lands on the page that lifts the refusal, then publishes the post again.
 */
export default function ReleaseXPostingBillingCard({
  code,
}: ReleaseXPostingBillingCardProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release.xPostingBilling');
  const { orgHref } = useOrgUrl();
  const needsPlan = code === X_POSTING_REQUIRES_PAID_PLAN_CODE;

  return (
    <div className="flex flex-col gap-3">
      <Alert size="sm" variant="warning">
        <AlertTitle>
          {translate(needsPlan ? 'planTitle' : 'creditsTitle')}
        </AlertTitle>
        <AlertDescription>
          {translate(needsPlan ? 'planDescription' : 'creditsDescription')}
        </AlertDescription>
      </Alert>
      <div>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
          <Link
            href={orgHref(
              needsPlan
                ? APP_ROUTES.SETTINGS.SUBSCRIPTION
                : APP_ROUTES.SETTINGS.CREDITS,
            )}
          >
            {translate(needsPlan ? 'planAction' : 'creditsAction')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
