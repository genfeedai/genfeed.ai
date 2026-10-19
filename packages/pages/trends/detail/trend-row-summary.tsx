'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendRowSummaryProps } from '@props/trends/trend-row-summary.props';
import Badge from '@ui/display/badge/Badge';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { useTranslations } from 'next-intl';

/** Right-sidebar body for a trend row in the trend tables. */
export default function TrendRowSummary({
  trend,
  platformLabel,
  openHref,
  openLabel,
}: TrendRowSummaryProps) {
  const translate = useTranslations('pages.analytics.trends');
  const discovery = useTranslations('ui.discovery');
  const metadata = trend.metadata;
  const growth =
    metadata?.growthMeasured === true
      ? `${trend.growthRate > 0 ? '+' : ''}${trend.growthRate}%`
      : discovery('notMeasured');
  const hashtags = metadata?.hashtags ?? [];

  return (
    <TableRowSummary
      badges={<Badge variant="secondary">{platformLabel}</Badge>}
      facts={[
        {
          id: 'mentions',
          label: translate('detail.metrics.mentions.label'),
          value: formatCompactNumber(trend.mentions),
        },
        {
          id: 'growth',
          label: translate('detail.metrics.growthRate.label'),
          value: growth,
        },
        {
          id: 'virality',
          label: translate('detail.metrics.viralityScore.label'),
          value: Math.round(trend.viralityScore),
        },
        {
          id: 'engagementRate',
          label: translate('detail.metrics.engagementRate.label'),
          value:
            metadata?.engagementRate === undefined
              ? undefined
              : `${metadata.engagementRate}%`,
        },
        {
          id: 'reach',
          label: translate('detail.metrics.reach.label'),
          value:
            metadata?.reach === undefined
              ? undefined
              : formatCompactNumber(metadata.reach),
        },
      ]}
      openHref={openHref}
      openLabel={openLabel}
    >
      {hashtags.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {translate('detail.relatedHashtags')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((hashtag) => (
              <Badge key={hashtag} variant="outline">
                {hashtag}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {metadata?.sampleContent ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {translate('detail.sampleContent')}
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground/80">
            {metadata.sampleContent}
          </p>
        </div>
      ) : null}
    </TableRowSummary>
  );
}
