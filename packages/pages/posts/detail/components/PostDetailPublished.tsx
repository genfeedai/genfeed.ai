'use client';

import type { AnalyticsStat } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import PostDetailAnalytics from '@pages/posts/detail/components/PostDetailAnalytics';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface PostDetailPublishedProps {
  stats: AnalyticsStat[];
  /** The live thread, rendered the way the platform shows it. */
  thread: ReactNode;
}

/**
 * What a published post shows in the page body: how it performed, then the
 * thread as it went out. There is nothing left to edit, so the composer and
 * the sidebar's Preview tab are not rendered.
 */
export default function PostDetailPublished({
  stats,
  thread,
}: PostDetailPublishedProps) {
  const translate = useTranslations('pages.posts.detail');

  return (
    <div className="space-y-6" data-testid="post-detail-published">
      {stats.length > 0 ? (
        <section aria-label={translate('performance')} className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {translate('performance')}
          </h2>
          <PostDetailAnalytics showEmptyState={false} stats={stats} />
        </section>
      ) : null}
      <section aria-label={translate('publishedThread')} className="space-y-3">
        {thread}
      </section>
    </div>
  );
}
