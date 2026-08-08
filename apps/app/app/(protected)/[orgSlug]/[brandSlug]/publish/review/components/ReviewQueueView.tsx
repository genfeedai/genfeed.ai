'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { CardVariant, PageScope } from '@genfeedai/enums';
import type { IBatchItem, IBatchSummary } from '@genfeedai/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { ClipboardCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import ReviewGrid from './ReviewGrid';
import ReviewStatusFilters from './ReviewStatusFilters';
import type { ReviewFilter, ReviewFilterCounts } from './review-grid.helpers';

/** Match Publish header chrome used by PostsListToolbar sort/status controls. */
const PUBLISH_HEADER_DROPDOWN_CLASS =
  'h-8 max-w-[16rem] rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white/80 hover:bg-white/[0.06] hover:text-white';

export function getBatchOptionLabel(batch: IBatchSummary): string {
  const shortId = batch.id.slice(-6);
  const status =
    typeof batch.status === 'string' && batch.status.trim()
      ? batch.status.replaceAll('_', ' ').toLowerCase()
      : '';
  return `${shortId} · ${batch.totalCount} items${status ? ` · ${status}` : ''}`;
}

interface ReviewQueueViewProps {
  activeFilter: ReviewFilter;
  activeItem: IBatchItem | null;
  activeBatch: IBatchSummary | null;
  activeBatchError: Error | null;
  activeBatchId: string | null;
  batchList: IBatchSummary[];
  batchesError: Error | null;
  filterCounts: ReviewFilterCounts;
  hasInvalidBatchPayload: boolean;
  isActioning: boolean;
  isBatchLoading: boolean;
  isRefreshing?: boolean;
  selectedIds: Set<string>;
  selectedPostId: string | null;
  visibleItems: IBatchItem[];
  onApprove: (itemId: string) => Promise<void>;
  onBatchChange: (value: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onClosePostDetail: () => void;
  onFilterChange: (filter: ReviewFilter) => void;
  onRefresh: () => void | Promise<void>;
  onRequestChanges: (itemId: string, feedback?: string) => Promise<void>;
  onReject: (itemId: string, feedback?: string) => Promise<void>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}

/**
 * Review queue body only — publish layout owns Container / New release / refresh.
 * Status filters + batch picker register into the layout action rail (first
 * level topbar) via PostsLayoutContext.setFiltersNode.
 */
export default function ReviewQueueView({
  activeFilter,
  activeItem,
  activeBatch,
  activeBatchError,
  activeBatchId,
  batchList,
  batchesError,
  filterCounts,
  hasInvalidBatchPayload,
  isActioning,
  isBatchLoading,
  isRefreshing = false,
  selectedIds,
  selectedPostId,
  visibleItems,
  onApprove,
  onBatchChange,
  onBulkApprove,
  onBulkReject,
  onClosePostDetail,
  onFilterChange,
  onRefresh,
  onRequestChanges,
  onReject,
  onSelectItem,
  onToggleSelect,
}: ReviewQueueViewProps) {
  const { setFiltersNode, setIsRefreshing, setRefresh } = usePostsLayout();

  const batchOptions = useMemo(
    () =>
      batchList.map((batch) => ({
        label: getBatchOptionLabel(batch),
        value: batch.id,
      })),
    [batchList],
  );

  useEffect(() => {
    setRefresh(() => onRefresh);
    return () => {
      setRefresh(() => () => undefined);
    };
  }, [onRefresh, setRefresh]);

  useEffect(() => {
    setIsRefreshing(isRefreshing || isBatchLoading);
  }, [isBatchLoading, isRefreshing, setIsRefreshing]);

  useEffect(() => {
    if (batchOptions.length === 0) {
      setFiltersNode(null);
      return () => {
        setFiltersNode(null);
      };
    }

    // First-level topbar: status tabs + batch picker sit with New release /
    // refresh (publish layout `right` rail), not a second nested page header.
    setFiltersNode(
      <div className="flex min-w-0 items-center gap-2">
        <ReviewStatusFilters
          activeFilter={activeFilter}
          filterCounts={filterCounts}
          onFilterChange={onFilterChange}
        />
        <ButtonDropdown
          className={PUBLISH_HEADER_DROPDOWN_CLASS}
          name="review-batch"
          onChange={(_name, value) => {
            onBatchChange(value);
          }}
          options={batchOptions}
          placeholder="Select batch"
          tooltip="Select review batch"
          value={activeBatchId ?? ''}
        />
      </div>,
    );

    return () => {
      setFiltersNode(null);
    };
  }, [
    activeBatchId,
    activeFilter,
    batchOptions,
    filterCounts,
    onBatchChange,
    onFilterChange,
    setFiltersNode,
  ]);

  if (batchesError || hasInvalidBatchPayload) {
    return (
      <Card
        variant={CardVariant.DEFAULT}
        icon={TriangleAlert}
        label="Unable to load the review queue"
        description="The review batches response was invalid or failed to load. Refresh the page and check the batches API."
        bodyClassName="items-center py-12 text-center"
        iconWrapperClassName="bg-destructive/10 text-destructive"
        className="max-w-xl mx-auto"
      />
    );
  }

  if (batchList.length === 0) {
    return (
      <Card
        variant={CardVariant.DEFAULT}
        icon={ClipboardCheck}
        label="No review work waiting"
        description="Generated batches appear here when drafts are ready to review."
        bodyClassName="items-center py-12 text-center"
        iconWrapperClassName="bg-muted text-muted-foreground"
        className="max-w-xl mx-auto"
      />
    );
  }

  return (
    <>
      {isBatchLoading && !activeBatch ? (
        <Loading />
      ) : activeBatchError ? (
        <Card
          variant={CardVariant.DEFAULT}
          icon={TriangleAlert}
          label="Unable to load the selected batch"
          description="The batch list loaded, but the selected batch details could not be retrieved. Pick another batch or refresh."
          bodyClassName="items-center py-12 text-center"
          iconWrapperClassName="bg-warning/10 text-warning"
          className="max-w-xl mx-auto"
        />
      ) : activeBatch ? (
        <ReviewGrid
          activeItem={activeItem}
          isActioning={isActioning}
          items={visibleItems}
          selectedIds={selectedIds}
          onApprove={onApprove}
          onBulkApprove={onBulkApprove}
          onBulkReject={onBulkReject}
          onRequestChanges={onRequestChanges}
          onReject={onReject}
          onSelectItem={onSelectItem}
          onToggleSelect={onToggleSelect}
        />
      ) : (
        <Card
          variant={CardVariant.DEFAULT}
          icon={TriangleAlert}
          label="No batch details are available"
          description="Pick another batch or reload the queue."
          bodyClassName="items-center py-12 text-center"
          iconWrapperClassName="bg-warning/10 text-warning"
          className="max-w-xl mx-auto"
        />
      )}
      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.PUBLISHER}
        onClose={onClosePostDetail}
      />
    </>
  );
}
