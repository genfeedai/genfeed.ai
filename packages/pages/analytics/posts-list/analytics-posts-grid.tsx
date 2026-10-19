'use client';

import AnalyticsPostCard from '@pages/analytics/posts-list/analytics-post-card';
import type { AnalyticsPostsGridProps } from '@props/analytics/analytics-posts-grid.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { useTranslations } from 'next-intl';

const GRID_CLASS_NAME =
  'grid grid-cols-1 gap-4 @[32rem]:grid-cols-2 @[56rem]:grid-cols-3 @[80rem]:grid-cols-4';
const SKELETON_KEYS = Array.from(
  { length: 8 },
  (_, index) => `skeleton-${index}`,
);

/**
 * Ranked analytics posts as a responsive grid of cards. Layout follows the
 * Posts grid (container-query columns) so both lists read the same.
 */
export default function AnalyticsPostsGrid({
  items,
  isLoading,
  emptyLabel,
  error,
  hasAudience = false,
  onSelectPost,
}: AnalyticsPostsGridProps) {
  const translate = useTranslations('pages.analytics.postCard');

  if (isLoading) {
    return (
      <div className="@container" data-testid="analytics-posts-grid-loading">
        <div className={GRID_CLASS_NAME}>
          {SKELETON_KEYS.map((key) => (
            <SkeletonCard
              key={key}
              label={translate('loadingPost')}
              showActions={false}
              showDescription={false}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <ErrorFallback title={error.title} resetErrorBoundary={error.onRetry} />
    );
  }

  if (items.length === 0) {
    return <CardEmpty label={emptyLabel} />;
  }

  return (
    <div className="@container" data-testid="analytics-posts-grid">
      <div className={GRID_CLASS_NAME}>
        {items.map((item) => (
          <AnalyticsPostCard
            key={item.postId}
            item={item}
            hasAudience={hasAudience}
            onSelectPost={onSelectPost}
          />
        ))}
      </div>
    </div>
  );
}
