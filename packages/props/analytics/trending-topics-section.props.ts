import type { TrendItem } from '@props/trends/trends-page.props';
import type { TableRowLink } from '@props/ui/display/table.props';
import type { ComponentType, CSSProperties } from 'react';

export type PlatformConfigEntry = {
  icon?: ComponentType<{
    className?: string;
    style?: CSSProperties;
  }>;
  label?: string;
  color?: string;
};

export type Props = {
  isLoadingTrends: boolean;
  trendingTopics: TrendItem[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
  getRowLink: (item: TrendItem) => TableRowLink;
};
