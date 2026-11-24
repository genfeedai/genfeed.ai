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
  /** First UTC day, `YYYY-MM-DD`. Defaults to 29 days before the end day. */
  startDate?: string;
  /** Last UTC day, `YYYY-MM-DD`, today at most. Defaults to today. */
  endDate?: string;
}
