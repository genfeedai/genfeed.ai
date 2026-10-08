import { getSafeExternalUrl } from '@genfeedai/helpers/media/social-media-source.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { Props } from '@props/analytics/trending-topics-section.props';
import type { TrendItem } from '@props/trends/trends-page.props';
import SocialMediaPlayer from '@ui/analytics/trends/social-media-player';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';

function getGrowthRateClass(rate: number): string {
  if (rate > 0) {
    return 'text-success';
  }
  if (rate < 0) {
    return 'text-error';
  }
  return '';
}

function getViralityBadgeClass(score: number): string {
  if (score >= 70) {
    return 'bg-primary text-primary-foreground';
  }
  if (score >= 40) {
    return 'bg-secondary text-secondary-foreground';
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
        <div className="animate-pulse space-y-3">
          {[
            'trend-skeleton-1',
            'trend-skeleton-2',
            'trend-skeleton-3',
            'trend-skeleton-4',
            'trend-skeleton-5',
          ].map((skeletonId) => (
            <div key={skeletonId} className="h-12 bg-background" />
          ))}
        </div>
      ) : trendingTopics.length === 0 ? (
        <div className="text-center py-8 text-foreground/60">
          <Flame className="size-12 mx-auto mb-3 opacity-30" />
          <p>{translate('topics.empty')}</p>
          <p className="text-sm mt-1">{translate('topics.emptyDescription')}</p>
        </div>
      ) : (
        <Table<TrendItem>
          items={trendingTopics.slice(0, 20)}
          getRowKey={(item) => item.id}
          getRowLink={getRowLink}
          columns={[
            {
              className: 'min-w-32',
              header: translate('columns.platform'),
              key: 'platform',
              render: (item) => {
                const config = platformConfigLookup[item.platform];
                const Icon = config?.icon;
                return (
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="size-4"
                        style={{ color: config?.color }}
                      />
                    )}
                    <span className="font-medium">
                      {config?.label || item.platform}
                    </span>
                  </div>
                );
              },
            },
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
                    : 'Not measured'}
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
                  className={`text-xs ${getViralityBadgeClass(item.viralityScore)}`}
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
              <p className="text-xs text-muted-foreground">
                {topic} · {source.platform}
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
                  Open source
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
