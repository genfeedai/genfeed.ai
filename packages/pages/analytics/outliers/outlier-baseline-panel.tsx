'use client';

import type {
  OutlierPerformanceResponse,
  OutlierSnapshotResponse,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { OutlierBaselinePanelProps } from '@props/analytics/analytics-outliers.props';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatOutlierRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}x`;
}

/**
 * An outlier post and the baseline it was measured against, in the right
 * context sidebar. Loads the snapshot behind the selected post.
 */
export default function OutlierBaselinePanel({
  openHref,
  post,
}: OutlierBaselinePanelProps) {
  const translate = useTranslations('pages.analytics.outliers');
  const getService = useAuthedService((token: string) =>
    OutlierBaselinesService.getInstance(token),
  );
  const [snapshot, setSnapshot] = useState<OutlierSnapshotResponse | null>(
    null,
  );
  const [snapshotPosts, setSnapshotPosts] = useState<
    OutlierPerformanceResponse[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const baselineSnapshotId = post.baselineSnapshotId;

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setSnapshot(null);
    setSnapshotPosts([]);
    void (async () => {
      try {
        const service = await getService();
        const [nextSnapshot, nextPosts] = await Promise.all([
          service.getSnapshot(baselineSnapshotId, controller.signal),
          service.listSnapshotPosts(
            baselineSnapshotId,
            { limit: 100 },
            controller.signal,
          ),
        ]);
        if (!controller.signal.aborted) {
          setSnapshot(nextSnapshot);
          setSnapshotPosts(nextPosts);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('GET /outlier-baselines/:id failed', error);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [baselineSnapshotId, getService]);

  const contributors = snapshotPosts.filter((entry) => entry.isContributor);
  const excluded = snapshotPosts.filter(
    (entry) => entry.exclusionReasons.length > 0,
  );
  const unknown = snapshotPosts.filter(
    (entry) => entry.isPinnedUnknown || entry.isPromotedUnknown,
  );

  return (
    <div data-testid="outlier-baseline-panel">
      <TableRowSummary
        badges={
          post.outlierTier ? (
            <Badge value={post.outlierTier} className="text-xs capitalize" />
          ) : undefined
        }
        facts={[
          {
            id: 'platform',
            label: translate('platform'),
            value: post.platform,
          },
          {
            id: 'views',
            label: translate('views'),
            value:
              post.views == null ? undefined : formatCompactNumber(post.views),
          },
          {
            id: 'ratio',
            label: translate('ratio'),
            value: formatOutlierRatio(post.outlierRatio),
          },
        ]}
        openHref={openHref}
        openLabel={translate('openPost')}
      >
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{translate('baseline')}</h3>
          <Text size="sm" color="subtle-60">
            {translate('sheetDescription')}
          </Text>
        </div>
        {isLoading ? (
          <Text size="sm" color="subtle-60">
            {translate('loadingBaseline')}
          </Text>
        ) : snapshot ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-foreground/60">
                  {translate('medianViews')}
                </dt>
                <dd className="font-semibold">
                  {snapshot.medianViews == null
                    ? '—'
                    : formatCompactNumber(snapshot.medianViews)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">
                  {translate('sampleSize')}
                </dt>
                <dd className="font-semibold">{snapshot.sampleSize}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">{translate('window')}</dt>
                <dd className="font-semibold">{snapshot.windowSize}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">{translate('computed')}</dt>
                <dd className="font-semibold">
                  {formatTimestamp(snapshot.computedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">{translate('status')}</dt>
                <dd className="font-semibold">{snapshot.status}</dd>
              </div>
            </dl>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {translate('contributingPosts')}
              </h3>
              {contributors.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  {translate('noContributors')}
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {contributors.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId} ·{' '}
                      {post.views == null
                        ? '—'
                        : formatCompactNumber(post.views)}{' '}
                      {translate('views')}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {translate('excludedPosts')}
              </h3>
              {excluded.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  {translate('noExcluded')}
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {excluded.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId} · {post.exclusionReasons.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {translate('unknownEligibility')}
              </h3>
              {unknown.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  {translate('unknownEligibilityReady')}
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {unknown.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId}
                      {post.isPinnedUnknown
                        ? ` · ${translate('pinnedUnknown')}`
                        : ''}
                      {post.isPromotedUnknown
                        ? ` · ${translate('promotedUnknown')}`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <Text size="sm" color="subtle-60">
            {translate('selectPost')}
          </Text>
        )}
      </TableRowSummary>
    </div>
  );
}
