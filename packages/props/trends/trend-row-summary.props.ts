import type { TrendItem } from '@props/trends/trends-page.props';

export interface TrendRowSummaryProps {
  trend: TrendItem;
  /** Localized platform name shown as the leading badge. */
  platformLabel: string;
  /** The trend's detail page. */
  openHref: string;
  openLabel: string;
}
