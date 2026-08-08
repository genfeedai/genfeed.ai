'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { CardVariant, PageScope } from '@genfeedai/enums';
import type { IBatchItem, IBatchSummary } from '@genfeedai/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ClipboardCheck, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import ReviewGrid from './ReviewGrid';
import type { ReviewFilter, ReviewFilterCounts } from './review-grid.helpers';

function getBatchOptionLabel(batch: IBatchSummary): string {
  const shortId = batch.id.slice(-6);
  const status =
    typeof batch.status === 'string' ? batch.status.replaceAll('_', ' ') : '';
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
 * Review queue body only — publish layout owns Container / New post / refresh.
 * Batch picker registers into the layout action rail via PostsLayoutContext.
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
    if (batchList.length === 0) {
      setFiltersNode(null);
      return () => {
        setFiltersNode(null);
      };
    }

    setFiltersNode(
      <Select value={activeBatchId ?? ''} onValueChange={onBatchChange}>
        <SelectTrigger
          aria-label="Select review batch"
          className="h-8 w-[min(100%,16rem)] text-xs"
        >
          <SelectValue placeholder="Select batch" />
        </SelectTrigger>
        <SelectContent>
          {batchList.map((batch) => (
            <SelectItem key={batch.id} value={batch.id}>
              {getBatchOptionLabel(batch)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );

    return () => {
      setFiltersNode(null);
    };
  }, [activeBatchId, batchList, onBatchChange, setFiltersNode]);

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
          activeFilter={activeFilter}
          activeItem={activeItem}
          batch={activeBatch}
          filterCounts={filterCounts}
          isActioning={isActioning}
          items={visibleItems}
          selectedIds={selectedIds}
          onApprove={onApprove}
          onBulkApprove={onBulkApprove}
          onBulkReject={onBulkReject}
          onFilterChange={onFilterChange}
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
