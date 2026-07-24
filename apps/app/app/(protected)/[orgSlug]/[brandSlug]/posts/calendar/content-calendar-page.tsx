'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { COMPOSE_ROUTES, PLATFORM_COLORS } from '@genfeedai/constants';
import {
  ArticleStatus,
  CredentialPlatform,
  PageScope,
  PostStatus,
} from '@genfeedai/enums';
import type { IArticle } from '@genfeedai/interfaces';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import type { Post } from '@models/content/post.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import type { CalendarItem } from '@props/components/calendar.props';
import { ArticlesService } from '@services/content/articles.service';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import { EmptyState } from '@ui/feedback';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiCalendarDays, HiDocumentText, HiListBullet } from 'react-icons/hi2';

const DEFAULT_COLOR = '#8b5cf6';
const ARTICLE_STATUS_COLORS: Record<string, string> = {
  [ArticleStatus.ARCHIVED]: '#ef4444',
  [ArticleStatus.DRAFT]: '#6b7280',
  [ArticleStatus.PUBLIC]: '#10b981',
};

interface PostContentCalendarItem extends CalendarItem {
  itemType: 'post';
  post: Post;
}

interface ArticleContentCalendarItem extends CalendarItem {
  article: IArticle;
  itemType: 'article';
}

type ContentCalendarItem = PostContentCalendarItem | ArticleContentCalendarItem;

function getPlatformColor(platform: string): string {
  const platformKey = platform?.toLowerCase();
  return (
    PLATFORM_COLORS[platformKey as keyof typeof PLATFORM_COLORS]?.base ??
    DEFAULT_COLOR
  );
}

function getArticleColor(status: string): string {
  return ARTICLE_STATUS_COLORS[status] ?? DEFAULT_COLOR;
}

function getPostEventTitle(post: Post): string {
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

export default function ContentCalendarPage(): React.JSX.Element {
  const { brandId } = useBrand();
  const { push } = useRouter();
  const { href } = useOrgUrl();

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dateRange, setDateRange] = useCalendarWeekRange();

  useEffect(() => {
    if (!dateRange) {
      return;
    }

    let isActive = true;

    const loadContent = async () => {
      setIsLoading(true);

      try {
        const [postsService, articlesService] = await Promise.all([
          getPostsService(),
          getArticlesService(),
        ]);

        const postsQuery: Record<string, string | boolean | undefined> = {
          brandId,
          endDate: dateRange.end.toISOString(),
          pagination: false,
          startDate: dateRange.start.toISOString(),
        };

        const articlesQuery: Record<string, string | undefined> = {
          endDate: dateRange.end.toISOString(),
          startDate: dateRange.start.toISOString(),
        };

        const [fetchedPosts, fetchedArticles] = await Promise.all([
          postsService.findAll(postsQuery),
          articlesService.findAll(articlesQuery),
        ]);

        if (!isActive) {
          return;
        }

        setPosts(fetchedPosts);
        setArticles(fetchedArticles);
      } catch (error) {
        if (!isActive) {
          return;
        }
        logger.error('Failed to load calendar content', error);
        notificationsService.error('Failed to load calendar content');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isActive = false;
    };
  }, [
    dateRange,
    brandId,
    getPostsService,
    getArticlesService,
    notificationsService,
  ]);

  const calendarItems: ContentCalendarItem[] = useMemo(() => {
    const postItems: PostContentCalendarItem[] = posts.map((post) => ({
      id: post.id,
      isDisabled: isPostDisabled(post),
      itemType: 'post',
      post,
      scheduledDate: post.scheduledDate ?? undefined,
      status: post.platform || '',
      title: getPostEventTitle(post),
    }));

    const articleItems: ArticleContentCalendarItem[] = articles.map(
      (article) => ({
        article,
        id: article.id,
        itemType: 'article',
        scheduledDate: article.createdAt,
        status: article.status,
        title: article.label,
      }),
    );

    return [...postItems, ...articleItems];
  }, [posts, articles]);

  const handleEventClick = useCallback(
    (item: ContentCalendarItem) => {
      if (item.itemType === 'article') {
        push(`${COMPOSE_ROUTES.ARTICLE}?id=${item.article.id}`);
        return;
      }

      setSelectedPostId(item.post.id);
    },
    [push],
  );

  const handleDatesChange = useCallback(
    (start: Date, end: Date) => {
      setDateRange({ end, start });
    },
    [setDateRange],
  );

  const getEventColor = useCallback((item: ContentCalendarItem) => {
    if (item.itemType === 'article') {
      return getArticleColor(item.status);
    }

    return getPlatformColor(item.status);
  }, []);

  const filterControls = (
    <div className="flex items-center gap-2">
      <Link
        href={href(getPublisherPostsHref())}
        className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 size-9 transition-colors"
      >
        <HiListBullet />
      </Link>
      <Link
        href={COMPOSE_ROUTES.ARTICLE}
        className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 size-9 transition-colors"
      >
        <HiDocumentText />
      </Link>
    </div>
  );

  const modal = (
    <PostDetailOverlay
      postId={selectedPostId}
      scope={PageScope.PUBLISHER}
      onClose={() => setSelectedPostId(null)}
    />
  );

  const emptyState =
    !isLoading && calendarItems.length === 0 ? (
      <EmptyState
        icon={HiCalendarDays}
        title="Nothing scheduled yet"
        description="Plan and schedule your first post to see it on the calendar."
        action={{
          label: 'Create a post',
          onClick: () => push(COMPOSE_ROUTES.POST),
        }}
      />
    ) : undefined;

  return (
    <ContentCalendar
      items={calendarItems}
      onEventClick={handleEventClick}
      onDatesChange={handleDatesChange}
      getEventColor={getEventColor}
      filterControls={filterControls}
      modal={modal}
      emptyState={emptyState}
    />
  );
}
