'use client';

import type { ResearchScanStatus } from '@genfeedai/contracts/interfaces';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import { isWeeklyScanWindow } from './research-scan-window';

/**
 * How many scans an organization has left in one library. Both research pages
 * show it in their header so a person knows what a scan costs before they
 * spend it. A library with no limit shows that instead of a count.
 */
export default function ResearchScanBadge({
  status,
}: {
  status: ResearchScanStatus | undefined;
}) {
  const translate = useTranslations('pages.researchScans.badge');

  if (!status) {
    return null;
  }

  if (!status.limit || status.remaining === null) {
    return (
      <Badge data-testid="research-scan-badge" variant="secondary">
        {translate('unlimited')}
      </Badge>
    );
  }

  const values = {
    remaining: status.remaining,
    total: status.limit.maxScans,
  };

  return (
    <Badge
      data-testid="research-scan-badge"
      variant={status.remaining === 0 ? 'warning' : 'secondary'}
    >
      {isWeeklyScanWindow(status.limit)
        ? translate('leftWeek', values)
        : translate('leftDay', values)}
    </Badge>
  );
}
