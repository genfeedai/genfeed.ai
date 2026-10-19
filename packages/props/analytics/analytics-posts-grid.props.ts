export interface AnalyticsPostGridItem {
  postId: string;
  /** 1-based position in the ranked (sorted, filtered) list. */
  rank: number;
  label: string;
  platform: string;
  brandName: string;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number;
  thumbnailUrl?: string;
  ingredientUrl?: string;
  isVideo?: boolean;
  visibility?: string | null;
}

export interface AnalyticsPostsGridProps {
  items: AnalyticsPostGridItem[];
  isLoading: boolean;
  emptyLabel: string;
  error?: { title: string; onRetry: () => void };
  /** Adds the observed-audience badge (captured posts only). */
  hasAudience?: boolean;
  onSelectPost: (postId: string) => void;
}

export interface AnalyticsPostCardProps {
  item: AnalyticsPostGridItem;
  hasAudience: boolean;
  onSelectPost: (postId: string) => void;
}
