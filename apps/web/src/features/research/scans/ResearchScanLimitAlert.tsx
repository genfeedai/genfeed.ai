'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ResearchScanStatus } from '@genfeedai/contracts/interfaces';
import { RESEARCH_SCAN_LIMITS } from '@genfeedai/pricing';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { isWeeklyScanWindow } from './research-scan-window';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shown when a library has no scans left: when the next one opens, and, for an
 * organization with no plan, what a plan gives. It renders nothing while a
 * scan is available.
 */
export default function ResearchScanLimitAlert({
  status,
}: {
  status: ResearchScanStatus | undefined;
}) {
  const translate = useTranslations('pages.adsResearch.scans.limit');
  const format = useFormatter();
  const { orgHref } = useOrgUrl();

  if (!status?.limit || status.remaining !== 0 || !status.nextAvailableAt) {
    return null;
  }

  const opensAt = new Date(status.nextAvailableAt);
  const time = format.dateTime(opensAt, { hour: 'numeric', minute: '2-digit' });
  const isToday = opensAt.getTime() - Date.now() < DAY_MS;
  const proLimit = RESEARCH_SCAN_LIMITS.pro;

  return (
    <Alert variant="info" className="mb-4" data-testid="research-scan-limit">
      <AlertTitle>
        {isWeeklyScanWindow(status.limit)
          ? translate('titleWeek')
          : translate('titleDay')}
      </AlertTitle>
      <AlertDescription>
        {isToday
          ? translate('nextToday', { time })
          : translate('nextLater', {
              day: format.dateTime(opensAt, { weekday: 'long' }),
              time,
            })}
        {!status.hasPlan && proLimit
          ? ` ${translate('planPitch', { count: proLimit.maxScans })}`
          : ''}
      </AlertDescription>
      {status.hasPlan ? null : (
        <AlertActions>
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
              {translate('seePlans')}
            </Link>
          </Button>
        </AlertActions>
      )}
    </Alert>
  );
}
