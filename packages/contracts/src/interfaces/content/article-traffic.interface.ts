export type ArticleTrafficPeriod = '7d' | '30d' | '90d' | 'all';

export interface ArticleTrafficDay {
  date: string;
  views: number;
  resourceClicks: number;
}

export interface ArticleTraffic {
  articleId: string;
  status: 'available' | 'unavailable';
  reason:
    | 'not_configured'
    | 'not_published'
    | 'not_canonical'
    | 'upstream_error'
    | null;
  period: ArticleTrafficPeriod;
  startDate: string;
  endDate: string;
  totalViews: number | null;
  totalResourceClicks: number | null;
  days: ArticleTrafficDay[];
}

export interface ArticleTrafficInput {
  articleId: string;
  organizationId: string;
  brandId?: string;
  userId: string;
  period: ArticleTrafficPeriod;
}
