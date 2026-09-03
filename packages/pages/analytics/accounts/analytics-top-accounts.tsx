'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IAccountAnalytics } from '@genfeedai/contracts/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function AnalyticsTopAccounts() {
  const translate = useTranslations('pages.analytics.accounts');
  const router = useRouter();
  const { brandId } = useCollectionScope();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [accounts, setAccounts] = useState<IAccountAnalytics[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const service = await getService();
      const { startDate, endDate } = getDateRangeWithDefaults();
      const data = (await service.getTopAccounts({
        brandId: brandId || undefined,
        endDate,
        metric: AnalyticsMetric.VIEWS,
        startDate,
      })) as { accounts?: IAccountAnalytics[] };
      if (!controller.signal.aborted) {
        setAccounts(data.accounts ?? []);
      }
    })();
    return () => controller.abort();
  }, [brandId, getService]);

  if (accounts.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg">{translate('topAccounts')}</h2>
        <Button
          label="View all"
          variant={ButtonVariant.GHOST}
          onClick={() => router.push(APP_ROUTES.ANALYTICS.ACCOUNTS)}
        />
      </div>
      <ul className="space-y-2">
        {accounts.map((account) => {
          const views = account.metrics.find(
            (item) => item.metric === AnalyticsMetric.VIEWS,
          );
          return (
            <li key={account.identity.credentialId}>
              <Button
                className="flex w-full items-center justify-between text-left"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() =>
                  router.push(
                    `${APP_ROUTES.ANALYTICS.ACCOUNTS}/${account.identity.credentialId}`,
                  )
                }
              >
                <span>
                  {account.identity.label ||
                    account.identity.externalHandle ||
                    account.identity.externalName}
                </span>
                <span>
                  {views?.availability === 'observed' && views.change !== null
                    ? formatCompactNumberIntl(views.change)
                    : 'Unavailable'}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
