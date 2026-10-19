'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  type CredentialPlatform,
  PageScope,
  type PostCategory,
  type TargetExecutionState,
} from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Post } from '@models/content/post.model';
import PublishingContentIdentity from '@pages/posts/library/publishing-content-identity';
import { PostsService } from '@services/content/posts.service';
import { useQuery } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import Pagination from '@ui/navigation/pagination/Pagination';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import {
  capturedPostSummary,
  capturedPostTitle,
  resolveCapturedAudience,
} from './captured-post.helpers';
import {
  buildCapturedPostsListQueryKey,
  buildCapturedPostsQuery,
} from './captured-posts-list-query';
import type {
  ReleasePostsPublicationState,
  ReleasePostsSort,
} from './release-posts-list-query';

export interface CapturedPostsListProps {
  campaignId?: string;
  contentTypes?: PostCategory[];
  currentPage: number;
  executionStates?: TargetExecutionState[];
  onPageChange: (page: number) => void;
  platform?: CredentialPlatform;
  publicationState?: ReleasePostsPublicationState;
  scope: PageScope;
  search: string;
  sort: ReleasePostsSort;
}

interface CapturedPostsPage {
  pagination: {
    total: number;
    totalPages: number;
  };
  posts: Post[];
}

const EMPTY_PAGE: CapturedPostsPage = {
  pagination: { total: 0, totalPages: 1 },
  posts: [],
};

/**
 * Read-only publications the browser extension observed (`Post.source =
 * 'extension'`). They are not releases: there is no schedule, retry or reschedule
 * action and no credential or release target is invented for them.
 */
export default function CapturedPostsList({
  campaignId,
  contentTypes,
  currentPage,
  executionStates,
  onPageChange,
  platform,
  publicationState,
  scope,
  search,
  sort,
}: CapturedPostsListProps): React.JSX.Element {
  const translate = useTranslations('pages.posts.list.captured');
  const { brandId, isReady, organizationId } = useCollectionScope();
  const { activeHref } = useOrgUrl();
  const { setRefresh } = usePostsLayout();
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );
  const scopedBrandId =
    scope === PageScope.BRAND || scope === PageScope.PUBLISHING
      ? brandId
      : undefined;
  const apiQuery = useMemo(
    () =>
      organizationId
        ? buildCapturedPostsQuery({
            brandId: scopedBrandId,
            campaignId,
            contentTypes,
            executionStates,
            limit: ITEMS_PER_PAGE,
            organizationId,
            page: currentPage,
            platform,
            publicationState,
            search,
            sort,
          })
        : null,
    [
      campaignId,
      contentTypes,
      currentPage,
      executionStates,
      organizationId,
      platform,
      publicationState,
      scopedBrandId,
      search,
      sort,
    ],
  );
  const {
    data = EMPTY_PAGE,
    error,
    isLoading,
    refetch,
  } = useQuery({
    enabled: isReady && apiQuery !== null,
    queryFn: async ({ signal }): Promise<CapturedPostsPage> => {
      if (!apiQuery) {
        return EMPTY_PAGE;
      }
      const service = await getPostsService();
      const page = await service.findAllPage(apiQuery, signal);
      return {
        pagination: { total: page.total, totalPages: page.totalPages },
        posts: page.items,
      };
    },
    queryKey: buildCapturedPostsListQueryKey({
      brandId: scopedBrandId,
      campaignId,
      contentTypes,
      currentPage,
      organizationId,
      platform,
      scope,
      search,
      sort,
    }),
  });

  useEffect(() => {
    setRefresh(() => () => {
      void refetch();
    });
    return () => setRefresh(() => () => {});
  }, [refetch, setRefresh]);

  const getPostAnalyticsHref = (post: Post): string =>
    activeHref(
      `${APP_ROUTES.ANALYTICS.POSTS}?postId=${encodeURIComponent(post.id)}`,
    );

  const renderPostSummary = (post: Post) => {
    const audience = resolveCapturedAudience(post.visibility);
    return (
      <TableRowSummary
        badges={
          <>
            <Badge variant="secondary">{translate('sourceBadge')}</Badge>
            <Badge
              variant={audience === 'unavailable' ? 'outline' : 'secondary'}
            >
              {translate(`audience.${audience}`)}
            </Badge>
          </>
        }
        facts={[
          {
            id: 'platform',
            label: translate('columns.platform'),
            value: post.platform
              ? getPostsPlatformLabel(post.platform)
              : undefined,
          },
          {
            id: 'published',
            label: translate('columns.published'),
            value: formatDateInTimezone(
              post.publishedAt || post.publicationDate,
              browserTimezone,
              'short',
            ),
          },
        ]}
        openHref={getPostAnalyticsHref(post)}
        openLabel={translate('openAnalytics', {
          title: capturedPostTitle(post, translate('untitled')),
        })}
      >
        <p className="whitespace-pre-wrap text-sm text-foreground/80">
          {capturedPostSummary(post)}
        </p>
      </TableRowSummary>
    );
  };

  return (
    <div>
      <p className="mb-3 text-sm text-foreground/60">
        {translate('description')}
      </p>
      <Table<Post>
        ariaLabel={translate('tableLabel')}
        columns={[
          {
            header: translate('columns.content'),
            key: 'description',
            render: (post) => (
              <PublishingContentIdentity
                channels={post.platform ? [post.platform] : []}
                summary={capturedPostSummary(post)}
                title={capturedPostTitle(post, translate('untitled'))}
              />
            ),
          },
          {
            header: translate('columns.source'),
            key: 'source',
            render: () => (
              <Badge variant="secondary">{translate('sourceBadge')}</Badge>
            ),
          },
          {
            header: translate('columns.audience'),
            key: 'visibility',
            render: (post) => {
              const audience = resolveCapturedAudience(post.visibility);
              return (
                <Badge
                  variant={audience === 'unavailable' ? 'outline' : 'secondary'}
                >
                  {translate(`audience.${audience}`)}
                </Badge>
              );
            },
          },
          {
            header: translate('columns.published'),
            key: 'publishedAt',
            render: (post) =>
              formatDateInTimezone(
                post.publishedAt || post.publicationDate,
                browserTimezone,
                'short',
              ),
          },
        ]}
        emptyDescription={translate('empty.description')}
        emptyLabel={translate('empty.label')}
        error={
          error
            ? { onRetry: () => refetch(), title: translate('loadError') }
            : undefined
        }
        getRowKey={(post) => post.id}
        getRowLink={(post) => ({
          href: getPostAnalyticsHref(post),
          label: translate('openAnalytics', {
            title: capturedPostTitle(post, translate('untitled')),
          }),
        })}
        isLoading={isLoading}
        items={data.posts}
        rowSidebar={{
          getId: (post) => post.id,
          getSubtitle: (post) =>
            post.platform ? getPostsPlatformLabel(post.platform) : undefined,
          getTitle: (post) => capturedPostTitle(post, translate('untitled')),
          kind: 'post',
          render: renderPostSummary,
        }}
      />
      <div className="mt-4">
        <Pagination
          currentPage={currentPage}
          onPageChange={onPageChange}
          totalItems={data.pagination.total}
          totalLabel="posts"
          totalPages={data.pagination.totalPages}
        />
      </div>
    </div>
  );
}
