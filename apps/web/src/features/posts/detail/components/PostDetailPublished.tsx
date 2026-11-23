'use client';

import type { AnalyticsStat } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import SettingSwitch from '@/components/ui/setting-switch';
import PostDetailAnalytics from '@/features/posts/detail/components/PostDetailAnalytics';

export interface PostDetailPublishedProps {
  stats: AnalyticsStat[];
  thread: ReactNode;
  isTikTokInboxDelivered?: boolean;
  isHiddenFromProfile?: boolean;
  isUpdatingProfileVisibility?: boolean;
  onHiddenFromProfileChange: (isHidden: boolean) => void;
}

/**
 * What a published post shows in the page body: how it performed, then the
 * thread as it went out. There is nothing left to edit, so the composer and
 * the sidebar's Preview tab are not rendered. The one thing left to decide is
 * whether the public Genfeed profile lists the post; the post itself stays up
 * on the social network either way.
 */
export default function PostDetailPublished({
  stats,
  thread,
  isTikTokInboxDelivered = false,
  isHiddenFromProfile = false,
  isUpdatingProfileVisibility = false,
  onHiddenFromProfileChange,
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
      <section
        aria-label={translate(
          isTikTokInboxDelivered ? 'tiktokInboxDraftThread' : 'publishedThread',
        )}
        className="space-y-3"
      >
        {thread}
      </section>
      <section aria-label={translate('profileVisibility.ariaLabel')}>
        <SettingSwitch
          description={translate('profileVisibility.hint')}
          isChecked={isHiddenFromProfile}
          isDisabled={isUpdatingProfileVisibility}
          label={translate('profileVisibility.label')}
          onCheckedChange={onHiddenFromProfileChange}
        />
      </section>
    </div>
  );
}
