'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  PageScope,
} from '@genfeedai/contracts';
import type {
  IBatchItem,
  IBatchSummary,
} from '@genfeedai/contracts/interfaces';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { ClipboardCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import ReviewGrid from './ReviewGrid';
import ReviewStatusFilters, {
  PUBLISH_HEADER_DROPDOWN_CLASS,
} from './ReviewStatusFilters';
import ReviewWorkspaceSurfaceAdapter from './ReviewWorkspaceSurfaceAdapter';
import type {
  ReviewFilterCounts,
  ReviewStatusFilter,
} from './review-grid.helpers';

export function getBatchOptionLabel(batch: IBatchSummary): string {
  const shortId = batch.id.slice(-6);
  const status =
    typeof batch.status === 'string' && batch.status.trim()
      ? batch.status.replaceAll('_', ' ').toLowerCase()
      : '';
  return `${shortId} · ${batch.totalCount} items${status ? ` · ${status}` : ''}`;
}

interface ReviewQueueViewProps {
  activeFilters: readonly ReviewStatusFilter[];
  activeItem: IBatchItem | null;
  activeBatch: IBatchSummary | null;
  activeBatchError: Error | null;
  activeBatchId: string | null;
  batchList: IBatchSummary[];
  batchesError: Error | null;
  canDiscardBatch: boolean;
  filterCounts: ReviewFilterCounts;
  hasInvalidBatchPayload: boolean;
  isActioning: boolean;
  isBatchLoading: boolean;
  isRefreshing?: boolean;
  selectedIds: Set<string>;
  selectedPostId: string | null;
  visibleItems: IBatchItem[];
  onApprove: (itemId: string) => Promise<void>;
  onAssign: (itemId: string, assigneeId: string) => Promise<void>;
  onBatchChange: (value: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkRewriteWithAgent: () => void;
  onDiscardBatch: () => void;
  onClosePostDetail: () => void;
  onFilterChange: (filters: ReviewStatusFilter[]) => void;
  onRefresh: () => void | Promise<void>;
  onRequestChanges: (itemId: string, feedback?: string) => Promise<void>;
  onReject: (itemId: string, feedback?: string) => Promise<void>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => Promise<void>;
}

/**
 * Review queue body only — publish layout owns Container / New post / refresh.
 * Status filters, batch picker, and Discard batch register into the layout
 * action rail (sub topbar) via PostsLayoutContext.setFiltersNode.
 */
export default function ReviewQueueView({
  activeFilters,
  activeItem,
  activeBatch,
  activeBatchError,
  activeBatchId,
  batchList,
  batchesError,
  canDiscardBatch,
  filterCounts,
  hasInvalidBatchPayload,
  isActioning,
  isBatchLoading,
  isRefreshing = false,
  selectedIds,
  selectedPostId,
  visibleItems,
  onApprove,
  onAssign,
  onBatchChange,
  onBulkApprove,
  onBulkReject,
  onBulkRewriteWithAgent,
  onDiscardBatch,
  onClosePostDetail,
  onFilterChange,
  onRefresh,
  onRequestChanges,
  onReject,
  onSelectItem,
  onToggleSelect,
  onUnassign,
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

    // Sub topbar action rail: status + batch (+ discard) beside New content /
    // refresh — same vertical level, no page-body orphan row.
    setFiltersNode(
      <div className="flex min-w-0 items-center gap-2">
        <ReviewStatusFilters
          activeFilters={activeFilters}
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
        {canDiscardBatch ? (
          <Button
            className="h-8 shrink-0 gap-1.5 px-3 text-xs"
            icon={<Trash2 className="size-3.5" />}
            isDisabled={isActioning}
            label="Discard batch"
            onClick={onDiscardBatch}
            size={ButtonSize.SM}
            variant={ButtonVariant.DESTRUCTIVE}
            withWrapper={false}
          />
        ) : null}
      </div>,
    );

    return () => {
      setFiltersNode(null);
    };
  }, [
    activeBatchId,
    activeFilters,
    batchOptions,
    canDiscardBatch,
    filterCounts,
    isActioning,
    onBatchChange,
    onDiscardBatch,
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
        <>
          <ReviewWorkspaceSurfaceAdapter
            activeItem={activeItem}
            isActioning={isActioning}
            isSelected={activeItem ? selectedIds.has(activeItem.id) : false}
            onApprove={onApprove}
            onAssign={onAssign}
            onReject={onReject}
            onRequestChanges={onRequestChanges}
            onToggleSelect={onToggleSelect}
            onUnassign={onUnassign}
          />
          <ReviewGrid
            activeItem={activeItem}
            isActioning={isActioning}
            items={visibleItems}
            selectedIds={selectedIds}
            onBulkApprove={onBulkApprove}
            onBulkReject={onBulkReject}
            onBulkRewriteWithAgent={onBulkRewriteWithAgent}
            onSelectItem={onSelectItem}
            onToggleSelect={onToggleSelect}
          />
        </>
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
        scope={PageScope.PUBLISHING}
        onClose={onClosePostDetail}
      />
    </>
  );
}
