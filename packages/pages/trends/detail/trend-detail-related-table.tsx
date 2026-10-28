'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import TrendRowSummary from '@pages/trends/detail/trend-row-summary';
import type { TrendItem } from '@props/trends/trends-page.props';
import type { TableRowLink } from '@props/ui/display/table.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';

type TrendDetailRelatedTableProps = {
  relatedTrends: TrendItem[];
  getRowLink: (item: TrendItem) => TableRowLink;
};

export default function TrendDetailRelatedTable({
  relatedTrends,
  getRowLink,
}: TrendDetailRelatedTableProps) {
  const translate = useTranslations('pages.analytics.trends');

  if (relatedTrends.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <Card label={translate('detail.related.title')} icon={Globe}>
        <p className="text-sm text-foreground/60 mb-4">
          {translate('detail.related.description')}
        </p>
        <Table
          items={relatedTrends}
          getRowKey={(item) => item.id}
          getRowLink={getRowLink}
          rowSidebar={{
            getId: (item) => item.id,
            getSubtitle: (item) =>
              PLATFORM_CONFIGS[item.platform]?.label || item.platform,
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
              header: translate('columns.topic'),
              key: 'topic',
              render: (item) => (
                <span className="font-medium">{item.topic}</span>
              ),
            },
            {
              header: translate('columns.platform'),
              key: 'platform',
              render: (item) => <PlatformBadge platform={item.platform} />,
            },
            {
              header: translate('columns.mentions'),
              key: 'mentions',
              render: (item) => formatCompactNumber(item.mentions),
            },
            {
              header: translate('columns.growth'),
              key: 'growthRate',
              render: (item) => (
                <span
                  className={
                    item.growthRate > 0 ? 'text-success' : 'text-destructive'
                  }
                >
                  {item.growthRate > 0 ? '+' : ''}
                  {item.growthRate}%
                </span>
              ),
            },
            {
              header: translate('columns.virality'),
              key: 'viralityScore',
              render: (item) => <Badge value={item.viralityScore} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
