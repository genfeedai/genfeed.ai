'use client';

import { PageScope } from '@genfeedai/enums';
import type { IBatchItem, IBatchSummary } from '@genfeedai/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import ReviewGrid from './ReviewGrid';
import ReviewStatsHeader from './ReviewStatsHeader';
import type { ReviewFilter, ReviewFilterCounts } from './review-grid.helpers';

function getBatchOptionLabel(batch: IBatchSummary): string {
  return `Batch ${batch.id.slice(-6)} - ${batch.totalCount} items (${batch.status})`;
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
  selectedIds: Set<string>;
  selectedPostId: string | null;
  visibleItems: IBatchItem[];
  onApprove: (itemId: string) => Promise<void>;
  onBatchChange: (value: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onClosePostDetail: () => void;
  onFilterChange: (filter: ReviewFilter) => void;
  onRequestChanges: (itemId: string, feedback?: string) => Promise<void>;
  onReject: (itemId: string, feedback?: string) => Promise<void>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}

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
  selectedIds,
  selectedPostId,
  visibleItems,
  onApprove,
  onBatchChange,
  onBulkApprove,
  onBulkReject,
  onClosePostDetail,
  onFilterChange,
  onRequestChanges,
  onReject,
  onSelectItem,
  onToggleSelect,
}: ReviewQueueViewProps) {
  return (
    <Container
      label="Publishing Inbox"
      description="Review generated assets and drafts before posting."
      icon={HiOutlineClipboardDocumentCheck}
      right={
        batchList.length > 0 ? (
          <Select value={activeBatchId ?? ''} onValueChange={onBatchChange}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select batch" />
            </SelectTrigger>
            <SelectContent>
              {batchList.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {getBatchOptionLabel(batch)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {batchesError || hasInvalidBatchPayload ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 py-16 text-center">
          <HiOutlineExclamationTriangle className="mb-3 size-10 text-rose-400" />
          <p className="text-sm font-medium text-rose-100">
            Unable to load the review queue
          </p>
          <p className="mt-1 max-w-md text-xs text-rose-200/70">
            The review batches response was invalid or failed to load. Refresh
            the page and check the batches API response shape.
          </p>
        </div>
      ) : batchList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/50 py-16">
          <HiOutlineClipboardDocumentCheck className="mb-3 size-10 text-neutral-600" />
          <p className="text-sm text-neutral-500">No review work waiting</p>
          <p className="mt-1 text-xs text-neutral-600">
            Approved assets will appear here when they are ready to post
          </p>
        </div>
      ) : (
        <>
          <ReviewStatsHeader batch={activeBatch} isLoading={isBatchLoading} />

          {isBatchLoading ? (
            <Loading />
          ) : activeBatchError ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 py-16 text-center">
              <HiOutlineExclamationTriangle className="mb-3 size-10 text-amber-400" />
              <p className="text-sm font-medium text-amber-100">
                Unable to load the selected batch
              </p>
              <p className="mt-1 max-w-md text-xs text-amber-200/70">
                The batch list loaded, but the selected batch details could not
                be retrieved.
              </p>
            </div>
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
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 py-16 text-center">
              <HiOutlineExclamationTriangle className="mb-3 size-10 text-amber-400" />
              <p className="text-sm font-medium text-amber-100">
                No batch details are available
              </p>
              <p className="mt-1 max-w-md text-xs text-amber-200/70">
                The selected batch could not be resolved. Pick another batch or
                reload the queue.
              </p>
            </div>
          )}
        </>
      )}
      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.PUBLISHER}
        onClose={onClosePostDetail}
      />
    </Container>
  );
}
