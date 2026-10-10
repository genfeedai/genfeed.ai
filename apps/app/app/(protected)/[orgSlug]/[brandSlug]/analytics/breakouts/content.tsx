'use client';

import type {
  BreakoutResponsePage,
  BreakoutResponseView,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { BreakoutResponsesContentProps } from '@props/analytics/breakout-response-detail.props';
import { BreakoutResponsesService } from '@services/analytics/breakout-responses.service';
import Container from '@ui/layout/container/Container';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import BreakoutResponseDetail from './response-detail';

function ScopedBreakoutResponses({
  brandId,
  organizationId,
  strategyId,
}: BreakoutResponsesContentProps) {
  const t = useTranslations('pages.analytics.breakouts');
  const locale = useLocale();
  const getService = useAuthedService((token) =>
    BreakoutResponsesService.forOrganization(token, organizationId),
  );
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<BreakoutResponsePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BreakoutResponseView | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly re-reads current authorization and response state.
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    async function load() {
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const next = await service.list(
          brandId,
          { limit: 20, page },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (
          next.docs.some(
            (response) =>
              response.organizationId !== organizationId ||
              response.brandId !== brandId,
          )
        ) {
          throw new Error('Unexpected response scope');
        }
        setResult(next);
      } catch {
        if (!controller.signal.aborted) setError(t('loadError'));
      }
    }
    void load();
    return () => controller.abort();
  }, [brandId, organizationId, getService, page, refresh, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh also reconciles the selected response through its read endpoint.
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setDetailError(null);
    if (!selectedId) return () => controller.abort();
    const id = selectedId;
    async function load() {
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const next = await service.detail(
          brandId,
          id,
          strategyId ? { strategyId } : {},
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (
          next.id !== id ||
          next.organizationId !== organizationId ||
          next.brandId !== brandId
        ) {
          throw new Error('Unexpected response scope');
        }
        setDetail(next);
      } catch {
        if (!controller.signal.aborted) setDetailError(t('detailLoadError'));
      }
    }
    void load();
    return () => controller.abort();
  }, [brandId, organizationId, getService, selectedId, strategyId, refresh, t]);

  const currentResult = result?.page === page ? result : null;
  const isLoading = currentResult === null && error === null;
  const currentDetail = detail?.id === selectedId ? detail : null;
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          ariaLabel={t('refreshLabel')}
          isDisabled={isLoading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {t('refresh')}
        </Button>
      </div>
      {isLoading ? (
        <Text as="p" role="status">
          {t('loading')}
        </Text>
      ) : error ? (
        <Text as="p" color="destructive" role="alert">
          {error}
        </Text>
      ) : currentResult?.docs.length === 0 ? (
        <Text as="p">{t('empty')}</Text>
      ) : (
        <div className="space-y-3">
          {currentResult?.docs.map((response) => (
            <article
              key={response.id}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Heading as="h2" size="md">
                  {response.platform} ·{' '}
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
      {currentResult && (
        <nav
          className="flex flex-wrap items-center justify-between gap-3"
          aria-label={t('paginationLabel')}
        >
          <Text size="sm">
            {t('pageSummary', {
              page: currentResult.page,
              pages: Math.max(1, currentResult.pages),
              total: currentResult.total,
            })}
          </Text>
          <div className="flex gap-2">
            <Button
              isDisabled={page <= 1 || isLoading}
              onClick={() => {
                setSelectedId(null);
                setPage((value) => value - 1);
              }}
            >
              {t('previous')}
            </Button>
            <Button
              isDisabled={page >= currentResult.pages || isLoading}
              onClick={() => {
                setSelectedId(null);
                setPage((value) => value + 1);
              }}
            >
              {t('next')}
            </Button>
          </div>
        </nav>
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
            <Text as="p" role="status">
              {t('loadingDetails')}
            </Text>
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
    <Container label={t('title')} description={t('description')}>
      {!isReady ? (
        <Text as="p" role="status">
          {t('loadingBrandContext')}
        </Text>
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
    </Container>
  );
}
