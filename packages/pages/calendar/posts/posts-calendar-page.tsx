'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PLATFORM_COLORS } from '@genfeedai/constants';
import { CredentialPlatform, PageScope, PostStatus } from '@genfeedai/enums';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import type { Post } from '@models/content/post.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import type {
  PostCalendarItem,
  PostsCalendarPageProps,
} from '@props/publisher/posts-calendar.props';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import Link from 'next/link';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { HiListBullet } from 'react-icons/hi2';

const DEFAULT_COLOR = '#8b5cf6';

function getPlatformColor(platform: string): string {
  const platformKey = platform?.toLowerCase();
  return (
    PLATFORM_COLORS[platformKey as keyof typeof PLATFORM_COLORS]?.base ??
    DEFAULT_COLOR
  );
}

function getEventTitle(post: Post): string {
  if (post.platform === CredentialPlatform.YOUTUBE) {
    return post.label || 'Untitled';
  }
  return post.description || post.label || 'Untitled';
}

function isPostDisabled(post: Post): boolean {
  if (post.status === PostStatus.PUBLIC) {
    return true;
  }

  if (post.scheduledDate) {
    return new Date(post.scheduledDate) < new Date();
  }

  return false;
}

export default function PostsCalendarPage({
  scope = PageScope.BRAND,
}: Partial<Pick<PostsCalendarPageProps, 'scope'>> = {}): React.JSX.Element {
  const { brandId } = useBrand();

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useCalendarWeekRange();

  useEffect(() => {
    if (!dateRange) {
      return;
    }

    const loadPosts = async () => {
      let url = 'GET /posts';

      try {
        const postsService = await getPostsService();

        const query: Record<string, string | boolean | undefined> = {
          brandId: scope === PageScope.BRAND ? brandId : undefined,
          endDate: dateRange.end.toISOString(),
          pagination: false,
          startDate: dateRange.start.toISOString(),
        };

        const posts = await postsService.findAll(query);
        setPosts(posts);

        logger.info(`${url} success`, posts);
      } catch (error) {
        url = 'Failed to load posts';
        logger.error(url, error);
        notificationsService.error(url);
      }
    };

    loadPosts();
  }, [dateRange, brandId, scope, getPostsService, notificationsService]);

  const calendarItems: PostCalendarItem[] = posts.map((post) => ({
    id: post.id,
    isDisabled: isPostDisabled(post),
    post,
    scheduledDate: post.scheduledDate ?? undefined,
    status: post.platform || '',
    title: getEventTitle(post),
  }));

  const handleEventClick = (item: PostCalendarItem) => {
    setSelectedPostId(item.post.id);
  };

  const handleDatesChange = (start: Date, end: Date) => {
    setDateRange({ end, start });
  };

  const filterControls = (
    <Link
      href={getPublisherPostsHref()}
      className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 w-9 transition-colors"
    >
      <HiListBullet />
    </Link>
  );

  const modal = (
    <PostDetailOverlay
      postId={selectedPostId}
      scope={scope}
      onClose={() => setSelectedPostId(null)}
    />
  );

  return (
    <ContentCalendar
      items={calendarItems}
      onEventClick={handleEventClick}
      onDatesChange={handleDatesChange}
      getEventColor={(item) => getPlatformColor(item.status)}
      filterControls={filterControls}
      modal={modal}
    />
  );
}
