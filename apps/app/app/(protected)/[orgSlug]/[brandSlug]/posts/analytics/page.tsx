'use client';

import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export default function PostsAnalyticsPage() {
  return (
    <AnalyticsProvider syncWithBrandContext>
      <Suspense fallback={<LazyLoadingFallback variant="table" />}>
        <AnalyticsPostsList />
      </Suspense>
    </AnalyticsProvider>
  );
}
