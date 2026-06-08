'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { PageScope, type PostStatus } from '@genfeedai/enums';
import type { IPost, IPreset } from '@genfeedai/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import PostsGrid from '@pages/posts/list/components/PostsGrid';
import PostsListToolbar from '@pages/posts/list/components/PostsListToolbar';
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
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import PromptBarPost from '@ui/prompt-bars/post/PromptBarPost';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { POSTS_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import { useEffect } from 'react';
import { HiSquares2X2, HiTableCells } from 'react-icons/hi2';

export interface PostsListProps extends ContentProps {
  initialPostPresets?: IPreset[];
  initialPosts?: IPost[];
  platform?: string;
  status?: PostStatus;
}

export default function PostsList({
  initialPostPresets,
  initialPosts,
  scope,
  platform: platformParam,
  status: statusProp,
}: PostsListProps) {
  const {
    actions,
    adminBrand,
    adminOrg,
    availablePlatforms,
    columns,
    filterSort,
    filters,
    handleAdminBrandChange,
    handleAdminOrgChange,
    handleFiltersChange,
    handleGenerate,
    handleOpenPostDetail,
    handlePlatformChange,
    handlePostEvaluated,
    isGenerating,
    isLoading,
    platform,
    postPresets,
    posts,
    primaryCardAction,
    secondaryCardActions,
    selectedPostId,
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
    initialPosts,
    platform: platformParam,
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

      <PostsListToolbar
        searchValue={toolbarSearchValue}
        sortValue={filterSort || getDefaultSort(status)}
        sortOptions={sortOptions}
        onSearchChange={setToolbarSearchValue}
        onSortChange={(sortValue) =>
          handleFiltersChange({
            ...filters,
            sort: sortValue,
          })
        }
      />

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

          <div className="mt-4">
            <AutoPagination showTotal totalLabel="posts" />
          </div>
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
