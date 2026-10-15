'use client';

import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IngredientTabsPostsProps } from '@genfeedai/props/content/ingredient.props';
import type { TableAction } from '@genfeedai/props/ui/display/table.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import { ExternalLink } from 'lucide-react';
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
      render: (p: IPost) =>
        p.platform ? <PlatformBadge platform={p.platform} /> : '-',
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
  ];

  const actions: TableAction<IPost>[] = [
    {
      href: (p) => p.url || undefined,
      icon: <ExternalLink />,
      isExternal: true,
      tooltip: 'View post',
    },
  ];

  return (
    <AppTable<IPost>
      items={posts}
      actions={actions}
      columns={columns}
      getRowKey={(p) => p.id}
      isLoading={isLoading}
      emptyLabel={EMPTY_STATES.POSTS_YET}
    />
  );
}
