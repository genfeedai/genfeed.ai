'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { PageScope, type Platform, PostStatus } from '@genfeedai/contracts';
import type { IPost, IPreset } from '@genfeedai/contracts/interfaces';
import type { ContentProps } from '@props/layout/content.props';
import CollectionSection from '@ui/collection/CollectionSection';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { LayoutGrid, Table } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import AdminPostsTable from '@/features/posts/list/components/AdminPostsTable';
import PostsGrid from '@/features/posts/list/components/PostsGrid';
import PostsListToolbar, {
  PostsListSearch,
} from '@/features/posts/list/components/PostsListToolbar';
import type { PostsListResult } from '@/features/posts/list/components/posts-query.helpers';
import { needsPostAttention } from '@/features/posts/list/post-attention.helpers';
import type {
  PostsPublicationState,
  PublishingPostsView,
} from '@/features/posts/list/posts-list-query';
import {
  getDefaultSort,
  usePostsList,
  VIEW_TYPE_GRID,
  VIEW_TYPE_TABLE,
} from '@/features/posts/list/usePostsList';

export interface PostsListProps extends ContentProps {
  initialPostPresets?: IPreset[];
  initialPagination?: PostsListResult['pagination'];
  initialPosts?: IPost[];
  platform?: string;
  /** `null` = all lifecycle states (canonical Posts library). */
  publicationState?: PostsPublicationState | null;
  status?: PostStatus;
  onRewriteWithAgent?: (post: IPost) => void;
  onSuggestScheduleWithAgent?: (post: IPost) => void;
}

export default function PostsList({
  initialPostPresets,
  initialPagination,
  initialPosts,
  scope,
  platform: platformParam,
  publicationState: publicationStateProp,
  status: statusProp,
  onRewriteWithAgent,
  onSuggestScheduleWithAgent,
}: PostsListProps) {
  const translate = useTranslations('pages.posts.list.collection');
  const { setLeadingNode } = usePostsLayout();
  const {
    currentPage,
    filterSearch,
    filterSort,
    filters,
    handleFiltersChange,
    handleSearchChange,
    handleOpenPostDetail,
    handlePageChange,
    handlePlatformChange,
    handlePublicationStateChange,
    handlePostEvaluated,
    isLoading,
    isError,
    findAllPosts,
    pagination,
    posts,
    primaryCardAction,
    publicationState,
    secondaryCardActions,
    selectedPostId,
    setFiltersNode,
    setSelectedPostId,
    setViewToggleNode,
    setViewType,
    sortOptions,
    status,
    viewType,
  } = usePostsList({
    initialPostPresets,
    initialPagination,
    initialPosts,
    platform: platformParam,
    publicationState: publicationStateProp,
    scope,
    status: statusProp,
    onRewriteWithAgent,
    onSuggestScheduleWithAgent,
  });
  const publishingView: PublishingPostsView | undefined =
    statusProp === PostStatus.FAILED ||
    statusProp === PostStatus.PENDING ||
    statusProp === PostStatus.PROCESSING
      ? statusProp
      : publicationState;

  // Keep latest filter bag for toolbar handlers without re-portaling on every
  // object identity change (that looped: setFiltersNode → layout dispatch →
  // re-render → new filters ref → setFiltersNode → … Maximum update depth).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const handleToolbarSortChange = useCallback(
    (sortValue: string) => {
      handleFiltersChange({
        ...filtersRef.current,
        sort: sortValue,
      });
    },
    [handleFiltersChange],
  );

  const isAdminScope = scope === PageScope.SUPERADMIN;

  // Pass ViewToggle to layout header (renders JSX — stays in component).
  // The admin list is always table rows, so it has no toggle.
  useEffect(() => {
    if (isAdminScope) return;
    setViewToggleNode(
      <ViewMenu
        options={[
          {
            icon: <LayoutGrid />,
            label: 'Card View',
            type: VIEW_TYPE_GRID,
          },
          {
            icon: <Table />,
            label: 'Table View',
            type: VIEW_TYPE_TABLE,
          },
        ]}
        activeView={viewType}
        onChange={setViewType}
      />,
    );
  }, [isAdminScope, viewType, setViewToggleNode, setViewType]);

  useEffect(() => {
    return () => setViewToggleNode(null);
  }, [setViewToggleNode]);

  useEffect(() => {
    setLeadingNode(
      <PostsListSearch
        searchValue={filterSearch}
        onSearchChange={handleSearchChange}
      >
        <PostsListToolbar
          isAttached
          sortValue={filterSort || getDefaultSort(status)}
          sortOptions={sortOptions}
          publishingView={publishingView}
          onPlatformChange={
            isAdminScope
              ? (value) => handlePlatformChange(value as Platform | 'all')
              : undefined
          }
          onPublishingViewChange={handlePublicationStateChange}
          onSortChange={handleToolbarSortChange}
          platformValue={platformParam ?? 'all'}
        />
      </PostsListSearch>,
    );
  }, [
    filterSearch,
    filterSort,
    handlePlatformChange,
    handlePublicationStateChange,
    handleSearchChange,
    handleToolbarSortChange,
    isAdminScope,
    platformParam,
    publishingView,
    setLeadingNode,
    sortOptions,
    status,
  ]);

  useEffect(() => {
    return () => {
      setFiltersNode(null);
      setLeadingNode(null);
    };
  }, [setFiltersNode, setLeadingNode]);

  return (
    <div>
      {isError && posts.length > 0 ? (
        <ErrorFallback
          compact
          title="Posts could not be refreshed."
          resetErrorBoundary={() => findAllPosts()}
        />
      ) : null}
      {isError && posts.length === 0 ? (
        <ErrorFallback
          title="Posts could not be loaded."
          resetErrorBoundary={() => findAllPosts()}
        />
      ) : isLoading && posts.length === 0 ? (
        <Loading isFullSize={false} />
      ) : (
        <>
          {isAdminScope ? (
            <AdminPostsTable
              posts={posts}
              isLoading={isLoading}
              onOpenPostDetail={handleOpenPostDetail}
            />
          ) : (
            <>
              <CollectionSection
                title={translate('needsYou')}
                itemCount={
                  posts.filter((post) =>
                    needsPostAttention(post.status, post.scheduledDate),
                  ).length
                }
                className="mb-6"
              >
                <PostsGrid
                  posts={posts.filter((post) =>
                    needsPostAttention(post.status, post.scheduledDate),
                  )}
                  view="list"
                  onPostEvaluated={handlePostEvaluated}
                  onOpenPostDetail={handleOpenPostDetail}
                  primaryAction={primaryCardAction}
                  secondaryActions={secondaryCardActions}
                />
              </CollectionSection>
              <CollectionSection isLoading={isLoading}>
                <PostsGrid
                  posts={posts}
                  view={viewType === VIEW_TYPE_GRID ? 'grid' : 'list'}
                  onPostEvaluated={handlePostEvaluated}
                  onOpenPostDetail={handleOpenPostDetail}
                  primaryAction={primaryCardAction}
                  secondaryActions={secondaryCardActions}
                />
              </CollectionSection>
            </>
          )}

          <div className="mt-4">
            <Pagination
              totalItems={pagination.total}
              totalLabel="posts"
              currentPage={currentPage}
              totalPages={pagination.totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </>
      )}

      <PostDetailPanel
        postId={selectedPostId}
        scope={scope}
        onClose={() => setSelectedPostId(null)}
      />
    </div>
  );
}
