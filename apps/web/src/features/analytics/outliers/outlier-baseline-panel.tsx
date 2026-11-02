'use client';

import type {
  OutlierPerformanceResponse,
  OutlierSnapshotResponse,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { logger } from '@services/core/logger.service';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Badge } from '@ui/primitives/badge';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import type { OutlierBaselinePanelProps } from '@/features/analytics/props/analytics-outliers.props';

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
  const baselineSnapshotId = post.baselineSnapshotId;
  const baselineQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        const [snapshot, snapshotPosts] = await Promise.all([
          service.getSnapshot(baselineSnapshotId, signal),
          service.listSnapshotPosts(baselineSnapshotId, { limit: 100 }, signal),
        ]);
        return { snapshot, snapshotPosts };
      } catch (error) {
        logger.error('GET /outlier-baselines/:id failed', error);
        throw error;
      }
    },
    queryKey: ['outlier-baselines', 'snapshot', baselineSnapshotId],
    service: (token: string) => OutlierBaselinesService.getInstance(token),
  });
  const snapshot: OutlierSnapshotResponse | null =
    baselineQuery.data?.snapshot ?? null;
  const snapshotPosts: OutlierPerformanceResponse[] =
    baselineQuery.data?.snapshotPosts ?? [];
  const isLoading = baselineQuery.isLoading;

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
          post.outlierTier ? <Badge value={post.outlierTier} /> : undefined
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
