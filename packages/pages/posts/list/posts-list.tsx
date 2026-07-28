'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { PageScope, type PostStatus } from '@genfeedai/enums';
import type { IPost, IPreset } from '@genfeedai/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import PostsGrid from '@pages/posts/list/components/PostsGrid';
import PostsListToolbar from '@pages/posts/list/components/PostsListToolbar';
import type { PostsListResult } from '@pages/posts/list/components/posts-query.helpers';
import type { PostsPublicationState } from '@pages/posts/list/posts-list-query';
import {
  getDefaultSort,
  usePostsList,
  VIEW_TYPE_GRID,
  VIEW_TYPE_TABLE,
} from '@pages/posts/list/usePostsList';
import type { ContentProps } from '@props/layout/content.props';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import PromptBarPost from '@ui/prompt-bars/post/PromptBarPost';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { POSTS_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import { useEffect } from 'react';
import { HiSquares2X2, HiTableCells } from 'react-icons/hi2';

export interface PostsListProps extends ContentProps {
  initialPostPresets?: IPreset[];
  initialPagination?: PostsListResult['pagination'];
  initialPosts?: IPost[];
  platform?: string;
  publicationState?: PostsPublicationState;
  status?: PostStatus;
}

export default function PostsList({
  initialPostPresets,
  initialPagination,
  initialPosts,
  scope,
  platform: platformParam,
  publicationState: publicationStateProp,
  status: statusProp,
}: PostsListProps) {
  const {
    actions,
    adminBrand,
    adminOrg,
    availablePlatforms,
    columns,
    currentPage,
    filterSort,
    filters,
    handleAdminBrandChange,
    handleAdminOrgChange,
    handleFiltersChange,
    handleGenerate,
    handleOpenPostDetail,
    handlePageChange,
    handlePlatformChange,
    handlePublicationStateChange,
    handlePostEvaluated,
    isGenerating,
    isLoading,
    pagination,
    platform,
    postPresets,
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
  });

  // Pass ViewToggle to layout header (renders JSX — stays in component)
  useEffect(() => {
    setViewToggleNode(
      <ViewToggle
        options={[
          {
            icon: <HiSquares2X2 />,
            label: 'Card View',
            type: VIEW_TYPE_GRID,
          },
          {
            icon: <HiTableCells />,
            label: 'Table View',
            type: VIEW_TYPE_TABLE,
          },
        ]}
        activeView={viewType}
        onChange={setViewType}
      />,
    );
    return () => setViewToggleNode(null);
  }, [viewType, setViewToggleNode, setViewType]);

  useEffect(() => {
    setFiltersNode(
      <PostsListToolbar
        searchValue={toolbarSearchValue}
        sortValue={filterSort || getDefaultSort(status)}
        sortOptions={sortOptions}
        publicationState={publicationState}
        onPublicationStateChange={handlePublicationStateChange}
        onSearchChange={setToolbarSearchValue}
        onSortChange={(sortValue) =>
          handleFiltersChange({
            ...filters,
            sort: sortValue,
          })
        }
      />,
    );

    return () => setFiltersNode(null);
  }, [
    filterSort,
    filters,
    handleFiltersChange,
    handlePublicationStateChange,
    publicationState,
    setFiltersNode,
    setToolbarSearchValue,
    sortOptions,
    status,
    toolbarSearchValue,
  ]);

  return (
    <div className={scope === PageScope.PUBLISHER ? 'pb-24 md:pb-32' : ''}>
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
            {publicationState === 'posted'
              ? 'Posted'
              : publicationState === 'not-posted'
                ? 'Not posted'
                : 'All posts'}
          </h2>
          <p className="mt-1 text-sm text-foreground/55">
            {publicationState === 'posted'
              ? 'Posts already live on their destination platforms.'
              : publicationState === 'not-posted'
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

      {scope === PageScope.PUBLISHER && (
        <PromptBarSurfaceRenderer
          surface={POSTS_PROMPT_BAR_SURFACE}
          topContent={<LowCreditsBanner />}
        >
          <PromptBarPost
            onSubmit={handleGenerate}
            isEnhancing={isGenerating}
            showCountDropdown={true}
            showThreadToggle={true}
            buttonLabel="Generate"
            platform={platform}
            onPlatformChange={handlePlatformChange}
            availablePlatforms={availablePlatforms}
            presets={postPresets}
          />
        </PromptBarSurfaceRenderer>
      )}

      <PostDetailOverlay
        postId={selectedPostId}
        scope={scope}
        onClose={() => setSelectedPostId(null)}
      />
    </div>
  );
}
