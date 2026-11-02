'use client';
import { useOptionalAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import type {
  BreakoutResponsePage,
  BreakoutResponseView,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { BreakoutResponsesService } from '@services/analytics/breakout-responses.service';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BreakoutResponsesContentProps } from '@/features/analytics/props/breakout-response-detail.props';
import BreakoutResponseDetail from './response-detail';

const SKELETON_CARD_KEYS = ['one', 'two', 'three'] as const;

/**
 * The loading shape of the response list: the same bordered article cards the
 * results render, so the page does not jump when the data arrives.
 */
function BreakoutResponsesSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {SKELETON_CARD_KEYS.map((key) => (
        <div
          key={key}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <Skeleton variant="text" height={20} className="w-1/3" />
          <Skeleton variant="text" height={14} className="w-2/3" />
          <Skeleton variant="text" height={14} className="w-1/2" />
          <Skeleton variant="rounded" height={36} width={96} />
        </div>
      ))}
    </div>
  );
}

function ScopedBreakoutResponses({
  brandId,
  organizationId,
  strategyId,
}: BreakoutResponsesContentProps) {
  const t = useTranslations('pages.analytics.breakouts');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const refresh = useOptionalAnalyticsContext()?.refreshTrigger ?? 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const service = (token: string) =>
    BreakoutResponsesService.forOrganization(token, organizationId);

  // Cached per organization, brand and page, so coming back paints the list at
  // once. Refresh re-reads authorization and state in the background; a read
  // that fails or returns another scope's rows shows the error, never the
  // stale rows.
  const listQuery = useAuthedQuery({
    queryFn: async (breakouts, signal): Promise<BreakoutResponsePage> => {
      const next = await breakouts.list(brandId, { limit: 20, page }, signal);
      if (
        next.docs.some(
          (response) =>
            response.organizationId !== organizationId ||
            response.brandId !== brandId,
        )
      ) {
        throw new Error('Unexpected response scope');
      }
      return next;
    },
    queryKey: ['breakout-responses', 'list', organizationId, brandId, page],
    refreshKey: refresh,
    service,
  });

  const detailQuery = useAuthedQuery({
    enabled: selectedId !== null,
    queryFn: async (breakouts, signal): Promise<BreakoutResponseView> => {
      const id = selectedId ?? '';
      const next = await breakouts.detail(
        brandId,
        id,
        strategyId ? { strategyId } : {},
        signal,
      );
      if (
        next.id !== id ||
        next.organizationId !== organizationId ||
        next.brandId !== brandId
      ) {
        throw new Error('Unexpected response scope');
      }
      return next;
    },
    queryKey: [
      'breakout-responses',
      'detail',
      organizationId,
      brandId,
      selectedId,
      strategyId ?? null,
    ],
    refreshKey: refresh,
    service,
  });

  const error = listQuery.isError ? t('loadError') : null;
  const currentResult = error ? null : (listQuery.data ?? null);
  const isLoading = currentResult === null && error === null;
  const detailError = detailQuery.isError ? t('detailLoadError') : null;
  const currentDetail = detailError ? null : (detailQuery.data ?? null);
  return (
    <div className="space-y-5">
      {isLoading ? (
        <BreakoutResponsesSkeleton label={t('loading')} />
      ) : error ? (
        <Text as="p" color="destructive" role="alert">
          {error}
        </Text>
      ) : currentResult?.docs.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <div className="space-y-3">
          {currentResult?.docs.map((response) => (
            <article
              key={response.id}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Heading as="h2" size="md" className="flex items-center gap-2">
                  <PlatformBadge platform={response.platform} />
                  {response.source.format ?? t('unknownFormat')}
                </Heading>
                <Badge>
                  {response.source.status === 'current'
                    ? t('sourceCurrent')
                    : t('sourceChanged')}
                </Badge>
              </div>
              <Text as="p" size="sm" className="break-all">
                {t('originalPost', {
                  externalId: response.source.externalId,
                })}
              </Text>
              <Text as="p" size="sm">
                {response.trigger?.ratio == null
                  ? t('ratioUnavailable')
                  : t('ratioMedian', {
                      ratio: response.trigger.ratio.toLocaleString(locale),
                    })}
              </Text>
              <Text as="p" color="muted" size="sm">
                {t('detectedAt', { detectedAt: response.detectedAt })}
              </Text>
              <Text as="p" size="sm">
                {t('responseState', {
                  state: response.state.replaceAll('_', ' '),
                })}
              </Text>
              <Button
                ariaLabel={t('inspectLabel', {
                  externalId: response.source.externalId,
                })}
                onClick={() => setSelectedId(response.id)}
              >
                {t('inspect')}
              </Button>
            </article>
          ))}
        </div>
      )}
      {currentResult && currentResult.total > 0 && (
        <Pagination
          currentPage={currentResult.page}
          onPageChange={(nextPage) => {
            setSelectedId(null);
            setPage(nextPage);
          }}
          totalItems={currentResult.total}
          totalLabel={t('totalLabel')}
          totalPages={Math.max(1, currentResult.pages)}
        />
      )}
      {selectedId && (
        <div className="space-y-4 rounded-lg border border-border p-5">
          <Button onClick={() => setSelectedId(null)}>
            {t('closeDetails')}
          </Button>
          {detailError ? (
            <Text as="p" color="destructive" role="alert">
              {detailError}
            </Text>
          ) : currentDetail ? (
            <BreakoutResponseDetail response={currentDetail} />
          ) : (
            <div
              role="status"
              aria-label={t('loadingDetails')}
              className="space-y-3"
            >
              <Skeleton variant="text" height={20} className="w-1/3" />
              <Skeleton variant="text" height={14} className="w-3/4" />
              <Skeleton variant="text" height={14} className="w-1/2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BreakoutsContent() {
  const t = useTranslations('pages.analytics.breakouts');
  const { brandId, organizationId, isReady, pageScope } = useCollectionScope();
  const { sessionId, userId, orgId } = useAuthIdentity();
  const searchParams = useSearchParams();
  const strategyId = searchParams.get('strategyId')?.trim() || undefined;
  const isScopeReady =
    isReady && pageScope === 'brand' && Boolean(brandId && organizationId);
  // Remount before rendering another scope, including when the session changes.
  const scopeKey = JSON.stringify([
    organizationId,
    brandId,
    sessionId,
    userId,
    orgId,
    strategyId,
  ]);
  return (
    <div>
      {!isReady ? (
        <BreakoutResponsesSkeleton label={t('loadingBrandContext')} />
      ) : !isScopeReady || !brandId ? (
        <Text as="p">{t('selectBrand')}</Text>
      ) : (
        <ScopedBreakoutResponses
          key={scopeKey}
          brandId={brandId}
          organizationId={organizationId}
          strategyId={strategyId}
        />
      )}
    </div>
  );
}
