import type { TrendItem } from '@props/trends/trends-page.props';

export interface TrendRowSummaryProps {
  trend: TrendItem;
  /** The trend's detail page. */
  openHref: string;
  openLabel: string;
}
