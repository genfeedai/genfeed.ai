import type {
  ArticleTrafficDay,
  ArticleTrafficPeriod,
} from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import type { Article } from '@models/content/article.model';

export interface ArticleTrafficDialogProps {
  article: Article;
  onClose: () => void;
}

export interface ArticleTrafficChartProps {
  days: ArticleTrafficDay[];
}

export interface ArticleTrafficPeriodOption {
  value: ArticleTrafficPeriod;
  label: string;
}
