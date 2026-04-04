'use client';

import type { IArticle } from '@genfeedai/interfaces';
import { ArticleStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import type { ArticleCalendarItem } from '@props/publisher/articles-calendar.props';
import { ArticlesService } from '@services/content/articles.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { HiListBullet } from 'react-icons/hi2';

const ARTICLE_STATUS_COLORS: Record<string, string> = {
  [ArticleStatus.PUBLIC]: '#10b981',
  [ArticleStatus.DRAFT]: '#6b7280',
  [ArticleStatus.ARCHIVED]: '#ef4444',
};

const DEFAULT_COLOR = '#8b5cf6';

function getArticleColor(status: string): string {
  return ARTICLE_STATUS_COLORS[status] ?? DEFAULT_COLOR;
}

export default function ArticlesCalendarPage(): React.JSX.Element {
  const router = useRouter();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  const [articles, setArticles] = useState<IArticle[]>([]);
  const [dateRange, setDateRange] = useCalendarWeekRange();

  useEffect(() => {
    if (!dateRange) {
      return;
    }

    const loadArticles = async () => {
      try {
        const articlesService = await getArticlesService();

        const query: Record<string, string | undefined> = {
          endDate: dateRange.end.toISOString(),
          startDate: dateRange.start.toISOString(),
        };

        const articles = await articlesService.findAll(query);
        setArticles(articles);
      } catch (error) {
        logger.error('Failed to load articles', error);
        notificationsService.error('Failed to load articles');
      }
    };

    loadArticles();
  }, [dateRange, getArticlesService, notificationsService]);

  const calendarItems: ArticleCalendarItem[] = articles.map((article) => ({
    article,
    id: article.id,
    scheduledDate: article.createdAt,
    status: article.status,
    title: article.label,
  }));

  const handleEventClick = (item: ArticleCalendarItem) => {
    router.push(`${COMPOSE_ROUTES.ARTICLE}?id=${item.article.id}`);
  };

  const handleDatesChange = (start: Date, end: Date) => {
    setDateRange({ end, start });
  };

  const filterControls = (
    <Link
      href={COMPOSE_ROUTES.ARTICLE}
      className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 w-9 transition-colors"
    >
      <HiListBullet />
    </Link>
  );

  return (
    <ContentCalendar
      items={calendarItems}
      onEventClick={handleEventClick}
      onDatesChange={handleDatesChange}
      getEventColor={(item) => getArticleColor(item.status)}
      filterControls={filterControls}
    />
  );
}
