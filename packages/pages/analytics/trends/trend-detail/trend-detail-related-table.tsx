'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendItem } from '@props/trends/trends-page.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { HiOutlineGlobeAlt } from 'react-icons/hi2';

type TrendDetailRelatedTableProps = {
  relatedTrends: TrendItem[];
  onRowClick: (item: TrendItem) => void;
};

export default function TrendDetailRelatedTable({
  relatedTrends,
  onRowClick,
}: TrendDetailRelatedTableProps) {
  if (relatedTrends.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <Card label="Cross-Platform Trends" icon={HiOutlineGlobeAlt}>
        <p className="text-sm text-foreground/60 mb-4">
          Similar trends on other platforms
        </p>
        <Table
          items={relatedTrends}
          getRowKey={(item) => item.id}
          onRowClick={onRowClick}
          columns={[
            {
              header: 'Platform',
              key: 'platform',
              render: (item) => {
                const config = PLATFORM_CONFIGS[item.platform];
                const Icon = config?.icon;
                return (
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="size-4"
                        style={{ color: config?.color }}
                      />
                    )}
                    <span>{config?.label || item.platform}</span>
                  </div>
                );
              },
            },
            {
              header: 'Topic',
              key: 'topic',
              render: (item) => (
                <span className="font-medium">{item.topic}</span>
              ),
            },
            {
              header: 'Mentions',
              key: 'mentions',
              render: (item) => formatCompactNumber(item.mentions),
            },
            {
              header: 'Growth',
              key: 'growthRate',
              render: (item) => (
                <span
                  className={
                    item.growthRate > 0 ? 'text-success' : 'text-error'
                  }
                >
                  {item.growthRate > 0 ? '+' : ''}
                  {item.growthRate}%
                </span>
              ),
            },
            {
              header: 'Virality',
              key: 'viralityScore',
              render: (item) => (
                <Badge value={item.viralityScore} className="text-xs" />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
