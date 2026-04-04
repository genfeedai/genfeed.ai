'use client';

import { ButtonSize, ButtonVariant, PostStatus } from '@genfeedai/enums';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { PlatformTabBarProps } from '@props/content/platform-tab-bar.props';
import type { TabItem } from '@props/ui/navigation/tabs.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { useMemo } from 'react';
import { HiPlus } from 'react-icons/hi2';

const STATUS_COLORS: Record<PostStatus, string> = {
  [PostStatus.DRAFT]: 'bg-muted-foreground',
  [PostStatus.FAILED]: 'bg-red-500',
  [PostStatus.PENDING]: 'bg-muted-foreground',
  [PostStatus.PRIVATE]: 'bg-muted-foreground',
  [PostStatus.PROCESSING]: 'bg-blue-500',
  [PostStatus.PUBLIC]: 'bg-green-500',
  [PostStatus.SCHEDULED]: 'bg-orange-500',
  [PostStatus.UNLISTED]: 'bg-muted-foreground',
};

export default function PlatformTabBar({
  posts,
  activePlatform,
  onPlatformChange,
  onAddPlatform,
  className = '',
}: PlatformTabBarProps) {
  const tabs: TabItem[] = useMemo(() => {
    return posts.map((post) => {
      const Icon = getPlatformIconComponent(post.platform);

      return {
        badge: (
          <span
            className={`w-2 h-2 rounded-full ${STATUS_COLORS[post.status as PostStatus] || 'bg-muted-foreground'}`}
            title={post.status}
          />
        ),
        icon: Icon,
        id: post.platform,
        isDisabled: false,
        label: post.platform,
      };
    });
  }, [posts]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Tabs
        tabs={tabs}
        activeTab={activePlatform}
        onTabChange={onPlatformChange}
      />

      {onAddPlatform && (
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onAddPlatform}
          aria-label="Add platform variant"
        >
          <span className="flex items-center gap-2">
            <HiPlus className="w-4 h-4" />
            Add Platform
          </span>
        </Button>
      )}
    </div>
  );
}
