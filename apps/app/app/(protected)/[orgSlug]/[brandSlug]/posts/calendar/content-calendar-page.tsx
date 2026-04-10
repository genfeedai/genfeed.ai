'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PLATFORM_COLORS } from '@genfeedai/constants';
import {
  ArticleStatus,
  CredentialPlatform,
  PageScope,
  PostStatus,
} from '@genfeedai/enums';
import type { IArticle } from '@genfeedai/interfaces';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import type { Post } from '@models/content/post.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import type { CalendarItem } from '@props/components/calendar.props';
import { ArticlesService } from '@services/content/articles.service';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { HiDocumentText, HiListBullet } from 'react-icons/hi2';

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
  const router = useRouter();

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
  const [dateRange, setDateRange] = useCalendarWeekRange();

  useEffect(() => {
    if (!dateRange) {
      return;
    }

    const loadContent = async () => {
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

        setPosts(fetchedPosts);
        setArticles(fetchedArticles);
      } catch (error) {
        logger.error('Failed to load calendar content', error);
        notificationsService.error('Failed to load calendar content');
      }
    };

    loadContent();
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

  const handleEventClick = (item: ContentCalendarItem) => {
    if (item.itemType === 'article') {
      router.push(`${COMPOSE_ROUTES.ARTICLE}?id=${item.article.id}`);
      return;
    }

    setSelectedPostId(item.post.id);
  };

  const handleDatesChange = (start: Date, end: Date) => {
    setDateRange({ end, start });
  };

  const filterControls = (
    <div className="flex items-center gap-2">
      <Link
        href={getPublisherPostsHref()}
        className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 w-9 transition-colors"
      >
        <HiListBullet />
      </Link>
      <Link
        href={COMPOSE_ROUTES.ARTICLE}
        className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 w-9 transition-colors"
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

  return (
    <ContentCalendar
      items={calendarItems}
      onEventClick={handleEventClick}
      onDatesChange={handleDatesChange}
      getEventColor={(item) =>
        item.itemType === 'article'
          ? getArticleColor(item.status)
          : getPlatformColor(item.status)
      }
      filterControls={filterControls}
      modal={modal}
    />
  );
}
