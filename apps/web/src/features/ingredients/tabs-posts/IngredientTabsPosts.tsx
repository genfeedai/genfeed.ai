'use client';

import { PageScope } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@genfeedai/helpers/content/posts.helper';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useAuthedQuery } from '@genfeedai/hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { TableAction } from '@genfeedai/props/ui/display/table.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import { Badge } from '@ui/primitives/badge';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import type { IngredientTabsPostsProps } from '@/props/content/ingredient.props';

export default function IngredientTabsPosts({
  ingredient,
}: IngredientTabsPostsProps) {
  const { href } = useOrgUrl();
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Cached per ingredient: coming back to its Posts tab paints the rows at
  // once while they refresh.
  const { data: posts = [], isPending: isLoading } = useAuthedQuery({
    queryFn: async (service) => {
      const url = `GET /ingredients/${ingredient.id}/posts`;
      try {
        const data = await service.getPosts(ingredient.id);
        logger.info(`${url} success`, data);
        return data;
      } catch (error) {
        logger.error(`${url} failed`, error);
        throw error;
      }
    },
    queryKey: ['ingredient-posts', ingredient.id],
    service: (token: string) => IngredientsService.getInstance(token),
  });

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
      render: (p: IPost) => (
        <Link
          className="hover:underline"
          href={href(getPublishingPostHref(p.id))}
        >
          {p.label || 'Untitled post'}
        </Link>
      ),
    },
    {
      className: 'text-xs',
      header: 'Scheduled',
      key: 'scheduledDate',
      render: (post: IPost) => (
        <TableDateCell timeZone={browserTimezone} value={post.scheduledDate} />
      ),
    },
    {
      header: 'Published',
      key: 'publicationDate',
      render: (p: IPost) => (
        <TableDateCell timeZone={browserTimezone} value={p.publicationDate} />
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (p: IPost) => <Badge variant="secondary">{p.status}</Badge>,
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
    <>
      <AppTable<IPost>
        items={posts}
        actions={actions}
        columns={columns}
        getRowKey={(p) => p.id}
        isLoading={isLoading}
        emptyLabel={EMPTY_STATES.POSTS_YET}
        onRowClick={(p) => setSelectedPostId(p.id)}
      />
      <PostDetailPanel
        postId={selectedPostId}
        scope={PageScope.PUBLISHING}
        onClose={() => setSelectedPostId(null)}
      />
    </>
  );
}
