'use client';

import { PageScope, PostStatus } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { IPost, IPreset } from '@genfeedai/contracts/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import PostsGrid from '@pages/posts/list/components/PostsGrid';
import PostsListToolbar from '@pages/posts/list/components/PostsListToolbar';
import type { PostsListResult } from '@pages/posts/list/components/posts-query.helpers';
import type {
  PostsPublicationState,
  PublishingPostsView,
} from '@pages/posts/list/posts-list-query';
import {
  getDefaultSort,
  usePostsList,
  VIEW_TYPE_GRID,
  VIEW_TYPE_TABLE,
} from '@pages/posts/list/usePostsList';
import type { ContentProps } from '@props/layout/content.props';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { LayoutGrid, Table } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

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
  const {
    actions,
    adminBrand,
    adminOrg,
    columns,
    currentPage,
    filterSort,
    filters,
    handleAdminBrandChange,
    handleAdminOrgChange,
    handleFiltersChange,
    handleOpenPostDetail,
    handlePageChange,
    handlePublicationStateChange,
    handlePostEvaluated,
    isLoading,
    pagination,
    posts,
    primaryCardAction,
    publicationState,
    secondaryCardActions,
    selectedPostId,
    setFiltersNode,
    setSelectedPostId,
    setToolbarSearchValue,
    setViewToggleNode,
    setViewType,
    sortOptions,
    status,
    toolbarSearchValue,
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

  // Pass ViewToggle to layout header (renders JSX — stays in component)
  useEffect(() => {
    setViewToggleNode(
      <ViewToggle
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
  }, [viewType, setViewToggleNode, setViewType]);

  useEffect(() => {
    return () => setViewToggleNode(null);
  }, [setViewToggleNode]);

  useEffect(() => {
    setFiltersNode(
      <PostsListToolbar
        searchValue={toolbarSearchValue}
        sortValue={filterSort || getDefaultSort(status)}
        sortOptions={sortOptions}
        publishingView={publishingView}
        onPublishingViewChange={handlePublicationStateChange}
        onSearchChange={setToolbarSearchValue}
        onSortChange={handleToolbarSortChange}
      />,
    );
  }, [
    filterSort,
    handlePublicationStateChange,
    handleToolbarSortChange,
    publishingView,
    setFiltersNode,
    setToolbarSearchValue,
    sortOptions,
    status,
    toolbarSearchValue,
  ]);

  useEffect(() => {
    return () => setFiltersNode(null);
  }, [setFiltersNode]);

  return (
    <div>
      {scope === PageScope.SUPERADMIN && (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {publishingView === 'posted'
              ? 'Posted'
              : publishingView === PostStatus.FAILED
                ? 'Failed'
                : publishingView === PostStatus.PENDING
                  ? 'Pending'
                  : publishingView === PostStatus.PROCESSING
                    ? 'Publishing'
                    : publishingView === 'not-posted'
                      ? 'Not posted'
                      : 'All posts'}
          </h2>
          <p className="mt-1 text-sm text-foreground/55">
            {publishingView === 'posted'
              ? 'Posts already live on their destination platforms.'
              : publishingView === PostStatus.FAILED
                ? 'Posts that could not be published. Fix the issue and retry.'
                : publishingView === PostStatus.PENDING
                  ? 'Posts queued to enter the publishing pipeline.'
                  : publishingView === PostStatus.PROCESSING
                    ? 'Posts currently being sent to destination platforms.'
                    : publishingView === 'not-posted'
                      ? 'Drafts, scheduled posts, and publishing work in progress.'
                      : 'Posts across every publishing state.'}
          </p>
        </div>
        <p className="text-sm tabular-nums text-foreground/55">
          {pagination.total.toLocaleString()}{' '}
          {pagination.total === 1 ? 'post' : 'posts'}
        </p>
      </div>

      {isLoading && posts.length === 0 ? (
        <Loading isFullSize={false} />
      ) : (
        <>
          {viewType === VIEW_TYPE_GRID ? (
            <PostsGrid
              posts={posts}
              onPostEvaluated={handlePostEvaluated}
              onOpenPostDetail={handleOpenPostDetail}
              primaryAction={primaryCardAction}
              secondaryActions={secondaryCardActions}
            />
          ) : (
            <AppTable<IPost>
              items={posts}
              columns={columns}
              actions={actions}
              getRowKey={(post) => post.id}
              isLoading={isLoading}
              emptyLabel={EMPTY_STATES.POSTS_FOUND}
              onRowClick={handleOpenPostDetail}
            />
          )}

          {pagination.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}

      <PostDetailOverlay
        postId={selectedPostId}
        scope={scope}
        onClose={() => setSelectedPostId(null)}
      />
    </div>
  );
}
