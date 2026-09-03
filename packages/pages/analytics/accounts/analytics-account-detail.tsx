'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IAccountAnalyticsDetail } from '@genfeedai/contracts/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AnalyticsAccountDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const credentialId = params.id;
  const { brandId } = useCollectionScope();
  const { filters } = useAnalyticsContext();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [detail, setDetail] = useState<IAccountAnalyticsDetail | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const service = await getService();
      const { startDate, endDate } = getDateRangeWithDefaults(
        filters.startDate,
        filters.endDate,
      );
      const data = (await service.getAccountAnalyticsDetail(credentialId, {
        brandId: brandId || undefined,
        endDate,
        startDate,
      })) as IAccountAnalyticsDetail;
      if (!controller.signal.aborted) {
        setDetail(data);
      }
    })();
    return () => controller.abort();
  }, [brandId, credentialId, filters.endDate, filters.startDate, getService]);

  const title =
    detail?.identity.label || detail?.identity.externalHandle || 'Account';

  return (
    <Container
      label={title}
      right={
        <Button
          label="Manage account"
          variant={ButtonVariant.SECONDARY}
          onClick={() =>
            router.push(
              detail?.identity.manageHref ?? APP_ROUTES.SETTINGS.SOCIAL,
            )
          }
        />
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {(detail?.metrics ?? []).map((metric) => (
          <Card key={metric.metric}>
            <p className="text-sm text-muted-foreground">{metric.metric}</p>
            <p className="text-2xl">
              {metric.availability === 'observed' && metric.change !== null
                ? formatCompactNumberIntl(metric.change)
                : 'Unavailable'}
            </p>
          </Card>
        ))}
      </div>
      {detail?.evaluation ? (
        <Card className="mt-4">
          <p className="text-sm text-muted-foreground">Evaluation</p>
          <p className="text-lg">{detail.evaluation.state}</p>
          <p className="text-sm">
            {detail.evaluation.evidence.publishedPosts} posts over{' '}
            {detail.evaluation.evidence.windowWeeks} weeks
          </p>
        </Card>
      ) : null}
    </Container>
  );
}
