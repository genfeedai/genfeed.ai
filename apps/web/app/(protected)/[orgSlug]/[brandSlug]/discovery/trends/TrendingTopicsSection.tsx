import { ComponentSize } from '@genfeedai/contracts';
import { getSafeExternalUrl } from '@genfeedai/helpers/media/social-media-source.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendItem } from '@props/trends/trends-page.props';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import SocialMediaPlayer from '@/components/analytics/trends/social-media-player';
import TrendRowSummary from '@/features/trends/detail/trend-row-summary';
import type { Props } from '@/features/trends/props/trending-topics-section.props';

function getGrowthRateClass(rate: number): string {
  if (rate > 0) {
    return 'text-success';
  }
  if (rate < 0) {
    return 'text-destructive';
  }
  return '';
}

function getViralityBadgeClass(score: number): string {
  if (score >= 70) {
    return 'bg-primary text-primary-foreground';
  }
  if (score >= 40) {
    return 'bg-muted text-foreground';
  }
  return 'bg-muted text-muted-foreground';
}

export default function TrendingTopicsSection({
  isLoadingTrends,
  trendingTopics,
  platformConfigLookup,
  getRowLink,
}: Props) {
  const translate = useTranslations('pages.analytics.trends');
  const discovery = useTranslations('ui.discovery');

  const seen = new Set<string>();
  const examples = trendingTopics
    .flatMap((trend) =>
      (trend.sourcePreview ?? []).flatMap((source) => {
        const key = `${source.platform}:${source.sourceUrl}`;
        if (seen.has(key) || !getSafeExternalUrl(source.sourceUrl)) return [];
        seen.add(key);
        return [{ source, topic: trend.topic }];
      }),
    )
    .slice(0, 12);
  return (
    <>
      <p className="text-sm text-foreground/60">
        {translate('topics.description')}
      </p>
      {isLoadingTrends ? (
        <div className="space-y-3">
          {[
            'trend-skeleton-1',
            'trend-skeleton-2',
            'trend-skeleton-3',
            'trend-skeleton-4',
            'trend-skeleton-5',
          ].map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-12" />
          ))}
        </div>
      ) : trendingTopics.length === 0 ? (
        <EmptyState
          description={translate('topics.emptyDescription')}
          icon={Flame}
          title={translate('topics.empty')}
        />
      ) : (
        <Table<TrendItem>
          items={trendingTopics.slice(0, 20)}
          getRowKey={(item) => item.id}
          getRowLink={getRowLink}
          rowSidebar={{
            getId: (item) => item.id,
            getSubtitle: (item) =>
              platformConfigLookup[item.platform]?.label || item.platform,
            getTitle: (item) => item.topic,
            kind: 'trend',
            render: (item) => {
              const rowLink = getRowLink(item);
              return (
                <TrendRowSummary
                  openHref={rowLink.href}
                  openLabel={rowLink.label}
                  trend={item}
                />
              );
            },
          }}
          columns={[
            {
              className: 'min-w-48',
              header: translate('columns.topic'),
              key: 'topic',
              render: (item) => (
                <span className="font-semibold text-foreground">
                  {item.topic}
                </span>
              ),
            },
            {
              className: 'min-w-32',
              header: translate('columns.platform'),
              key: 'platform',
              render: (item) => <PlatformBadge platform={item.platform} />,
            },
            {
              className: 'min-w-24',
              header: translate('columns.mentions'),
              key: 'mentions',
              render: (item) => (
                <span className="font-medium">
                  {formatCompactNumber(item.mentions)}
                </span>
              ),
            },
            {
              className: 'min-w-20',
              header: translate('columns.growth'),
              key: 'growthRate',
              render: (item) => (
                <span
                  className={`font-medium ${getGrowthRateClass(item.growthRate)}`}
                >
                  {item.metadata?.growthMeasured === true
                    ? `${item.growthRate > 0 ? '+' : ''}${item.growthRate}%`
                    : discovery('notMeasured')}
                </span>
              ),
            },
            {
              className: 'min-w-20',
              header: translate('columns.virality'),
              key: 'viralityScore',
              render: (item) => (
                <Badge
                  value={item.viralityScore}
                  className={getViralityBadgeClass(item.viralityScore)}
                />
              ),
            },
          ]}
        />
      )}
      {examples.length ? (
        <CollectionGrid maxColumns={3}>
          {examples.map(({ source, topic }) => (
            <Card
              key={`${source.platform}:${source.sourceUrl}`}
              bodyClassName="space-y-3 p-4"
            >
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <PlatformBadge
                  platform={source.platform}
                  size={ComponentSize.SM}
                />
                {topic}
              </p>
              {source.contentType === 'video' ||
              source.thumbnailUrl ||
              source.mediaUrl ? (
                <SocialMediaPlayer
                  contentType={source.contentType}
                  sourceUrl={source.sourceUrl}
                  mediaUrl={source.mediaUrl}
                  thumbnailUrl={source.thumbnailUrl}
                  title={source.title || topic}
                />
              ) : (
                <a
                  href={getSafeExternalUrl(source.sourceUrl) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline"
                >
                  {discovery('openSource')}
                </a>
              )}
              <p className="line-clamp-6 whitespace-pre-wrap text-sm">
                {source.text || source.title}
              </p>
              {source.authorHandle ? (
                <p className="text-xs text-muted-foreground">
                  @{source.authorHandle}
                </p>
              ) : null}
            </Card>
          ))}
        </CollectionGrid>
      ) : null}
    </>
  );
}
