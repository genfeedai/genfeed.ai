import type { ArticleTrafficDay } from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import type { Article } from '@models/content/article.model';

export interface ArticleTrafficPanelProps {
  article: Article;
  /** The article's editor page, linked from the panel header. */
  openHref?: string;
  openLabel?: string;
}

export interface ArticleTrafficChartProps {
  days: ArticleTrafficDay[];
}
