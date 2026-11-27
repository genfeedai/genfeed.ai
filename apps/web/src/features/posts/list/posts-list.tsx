'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  ButtonVariant,
  PageScope,
  type Platform,
  PostStatus,
} from '@genfeedai/contracts';
import type { IPost, IPreset } from '@genfeedai/contracts/interfaces';
import type { ContentProps } from '@props/layout/content.props';
import CollectionSection from '@ui/collection/CollectionSection';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import SelectionToolbar from '@ui/lists/selection-toolbar/SelectionToolbar';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Button } from '@ui/primitives/button';
import { LayoutGrid, Table, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import { useConfirmPostRemoval } from '@/features/posts/hooks/use-confirm-post-removal/use-confirm-post-removal';
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
import { usePostsSelection } from '@/features/posts/list/use-posts-selection';
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
  const translateRemoval = useTranslations('ui.postRemoval');
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

  // A post shows once: failed posts sit in Needs you, the rest in the list.
  const attentionPosts = posts.filter((post) =>
    needsPostAttention(post.status),
  );
  const listPosts = posts.filter((post) => !needsPostAttention(post.status));
  const confirmPostRemoval = useConfirmPostRemoval();
  const {
    clearSelection,
    dropFromSelection,
    selectedIds,
    selectedPosts,
    toggleSelect,
  } = usePostsSelection(posts);
  const handleDeleteSelected = useCallback(() => {
    confirmPostRemoval(selectedPosts, async (removedIds) => {
      dropFromSelection(removedIds);
      await findAllPosts();
    });
  }, [confirmPostRemoval, dropFromSelection, findAllPosts, selectedPosts]);
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
  // use-effect-audit: ignore registers the toolbar nodes with the page shell
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

  // use-effect-audit: ignore releases timers, requests or subscriptions on unmount
  useEffect(() => {
    return () => setViewToggleNode(null);
  }, [setViewToggleNode]);

  // use-effect-audit: ignore registers the toolbar nodes with the page shell
  useEffect(() => {
    setLeadingNode(
      <PostsListSearch
        searchValue={filterSearch}
        onSearchChange={handleSearchChange}
      >
        <PostsListToolbar
          hasAdminScope={isAdminScope}
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

  // use-effect-audit: ignore clears the layout slots it registered when the page unmounts
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
              <SelectionToolbar
                clearLabel={translateRemoval('clearSelection')}
                count={selectedPosts.length}
                label={translateRemoval('selectedCount', {
                  count: selectedPosts.length,
                })}
                onClear={clearSelection}
              >
                <Button
                  ariaLabel={translateRemoval('deleteSelection')}
                  label={<Trash2 />}
                  onClick={handleDeleteSelected}
                  tooltip={translateRemoval('deleteSelection')}
                  variant={ButtonVariant.DESTRUCTIVE}
                />
              </SelectionToolbar>
              {attentionPosts.length > 0 ? (
                <CollectionSection
                  title={translate('needsYou')}
                  itemCount={attentionPosts.length}
                  className="mb-6"
                >
                  <PostsGrid
                    posts={attentionPosts}
                    view="list"
                    onPostEvaluated={handlePostEvaluated}
                    onOpenPostDetail={handleOpenPostDetail}
                    primaryAction={primaryCardAction}
                    secondaryActions={secondaryCardActions}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
                </CollectionSection>
              ) : null}
              <CollectionSection isLoading={isLoading}>
                <PostsGrid
                  posts={listPosts}
                  view={viewType === VIEW_TYPE_GRID ? 'grid' : 'list'}
                  onPostEvaluated={handlePostEvaluated}
                  onOpenPostDetail={handleOpenPostDetail}
                  primaryAction={primaryCardAction}
                  secondaryActions={secondaryCardActions}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
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
