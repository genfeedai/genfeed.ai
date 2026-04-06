'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import type { IPost } from '@genfeedai/interfaces';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { IngredientTabsPostsProps } from '@props/content/ingredient.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function IngredientTabsPosts({
  ingredient,
}: IngredientTabsPostsProps) {
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );

  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const [posts, setPosts] = useState<IPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const findAllIngredientsPosts = useCallback(
    async (signal: AbortSignal) => {
      const url = `GET /ingredients/${ingredient.id}/posts`;
      setIsLoading(true);

      try {
        const service = await getIngredientsService();
        const data = await service.getPosts(ingredient.id);

        if (signal.aborted) {
          return;
        }

        logger.info(`${url} success`, data);

        setPosts(data);
        if (!signal.aborted) {
          setIsLoading(false);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        logger.error(`${url} failed`, error);
        setPosts([]);
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [ingredient.id, getIngredientsService],
  );

  useEffect(() => {
    const controller = new AbortController();
    findAllIngredientsPosts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [findAllIngredientsPosts]);

  const columns = [
    {
      header: 'Platform',
      key: 'platform',
      render: (p: IPost) => <PlatformBadge platform={p.platform} />,
    },
    {
      header: 'Title',
      key: 'label',
      render: (p: IPost) => p.label || '-',
    },
    {
      className: 'text-xs',
      header: 'Scheduled',
      key: 'scheduledDate',
      render: (post: IPost) =>
        post.scheduledDate
          ? formatDateInTimezone(post.scheduledDate, browserTimezone, 'short')
          : '-',
    },
    {
      header: 'Published',
      key: 'publicationDate',
      render: (p: IPost) =>
        p.publicationDate ? new Date(p.publicationDate).toLocaleString() : '-',
    },
    {
      header: 'Status',
      key: 'status',
      render: (p: IPost) => (
        <Badge variant="ghost" className="uppercase">
          {p.status}
        </Badge>
      ),
    },
    {
      header: 'Link',
      key: 'url',
      render: (p: IPost) => {
        if (p.url) {
          return (
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              View
            </a>
          );
        }
        return '-';
      },
    },
  ];

  return (
    <AppTable<IPost>
      items={posts}
      columns={columns}
      getRowKey={(p) => p.id}
      isLoading={isLoading}
      emptyLabel={EMPTY_STATES.POSTS_YET}
    />
  );
}
