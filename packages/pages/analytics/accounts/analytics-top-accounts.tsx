'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IAccountAnalytics } from '@genfeedai/contracts/interfaces';
import type { AnalyticsTopAccountsProps } from '@genfeedai/props/analytics/analytics.props';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function AnalyticsTopAccounts({
  organizationId: organizationIdProp,
}: AnalyticsTopAccountsProps) {
  const translate = useTranslations('pages.analytics.accounts');
  const router = useRouter();
  const scope = useCollectionScope();
  const brandId = scope.brandId;
  const organizationId = organizationIdProp ?? scope.organizationId;
  // The brand context resolves the org id asynchronously. Fetching before it
  // lands puts `organizationId=` on the wire and the query DTO rejects it.
  const isFetchReady =
    Boolean(organizationIdProp) || isCollectionFetchReady(scope);
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [accounts, setAccounts] = useState<IAccountAnalytics[]>([]);

  useEffect(() => {
    if (!isFetchReady) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const { startDate, endDate } = getDateRangeWithDefaults();
        const data = (await service.getTopAccounts({
          brandId: brandId || undefined,
          endDate,
          metric: AnalyticsMetric.VIEWS,
          organizationId,
          startDate,
        })) as { accounts?: IAccountAnalytics[] };
        if (!controller.signal.aborted) {
          setAccounts(data.accounts ?? []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch top accounts analytics', error);
          setAccounts([]);
        }
      }
    })();
    return () => controller.abort();
  }, [brandId, getService, isFetchReady, organizationId]);

  if (accounts.length === 0) {
    return null;
  }

  return (
    <WorkspaceSurface
      actions={
        <Button
          label="View all"
          variant={ButtonVariant.GHOST}
          onClick={() => router.push(APP_ROUTES.ANALYTICS.ACCOUNTS)}
        />
      }
      density="compact"
      flush
      title={translate('topAccounts')}
    >
      <div>
        {accounts.map((account) => {
          const views = account.metrics.find(
            (item) => item.metric === AnalyticsMetric.VIEWS,
          );
          return (
            <ListRow
              key={account.identity.credentialId}
              density="compact"
              href={`${APP_ROUTES.ANALYTICS.ACCOUNTS}/${account.identity.credentialId}`}
              title={
                account.identity.label ||
                account.identity.externalHandle ||
                account.identity.externalName
              }
              trailing={
                <span className="text-sm text-foreground/55">
                  {views?.availability === 'observed' && views.change !== null
                    ? formatCompactNumberIntl(views.change)
                    : 'Unavailable'}
                </span>
              }
            />
          );
        })}
      </div>
    </WorkspaceSurface>
  );
}
