'use client';

import Loading from '@ui/loading/default/Loading';
import { Suspense, useCallback } from 'react';
import { useOpenAgentComposer } from '@/hooks/use-open-agent-composer';
import { buildReviewBatchRewriteAgentPrompt } from '@/lib/publishing/agent-seeded-actions';
import ReviewQueueView from './components/ReviewQueueView';
import { useReviewQueueContent } from './useReviewQueueContent';

function ReviewQueueContentContent() {
  const openAgentComposer = useOpenAgentComposer();
  const {
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
    isBatchesLoading,
    isBatchLoading,
    isRefreshing,
    refreshQueue,
    selectedIds,
    selectedPostId,
    visibleItems,
    handleApproveItem,
    handleAssignItem,
    handleBatchChange,
    handleBulkAction,
    handleDiscardBatch,
    handleFilterChange,
    handleRequestChanges,
    handleRejectItem,
    handleSelectItem,
    handleToggleSelect,
    handleUnassignItem,
    setSelectedPostId,
  } = useReviewQueueContent();

  const handleBulkRewriteWithAgent = useCallback(() => {
    if (!activeBatchId || selectedIds.size === 0) {
      return;
    }

    openAgentComposer(
      buildReviewBatchRewriteAgentPrompt({
        batchId: activeBatchId,
        itemIds: Array.from(selectedIds),
      }),
    );
  }, [activeBatchId, openAgentComposer, selectedIds]);

  if (isBatchesLoading) {
    return <Loading />;
  }

  return (
    <ReviewQueueView
      activeFilters={activeFilters}
      activeItem={activeItem}
      activeBatch={activeBatch}
      activeBatchError={activeBatchError as Error | null}
      activeBatchId={activeBatchId}
      batchList={batchList}
      batchesError={batchesError as Error | null}
      canDiscardBatch={canDiscardBatch}
      filterCounts={filterCounts}
      hasInvalidBatchPayload={hasInvalidBatchPayload}
      isActioning={isActioning}
      isBatchLoading={isBatchLoading}
      isRefreshing={isRefreshing}
      selectedIds={selectedIds}
      selectedPostId={selectedPostId}
      visibleItems={visibleItems}
      onApprove={handleApproveItem}
      onAssign={handleAssignItem}
      onBatchChange={handleBatchChange}
      onBulkApprove={() => handleBulkAction('approve')}
      onBulkReject={() => handleBulkAction('reject')}
      onBulkRewriteWithAgent={handleBulkRewriteWithAgent}
      onDiscardBatch={handleDiscardBatch}
      onClosePostDetail={() => setSelectedPostId(null)}
      onFilterChange={handleFilterChange}
      onRefresh={refreshQueue}
      onRequestChanges={handleRequestChanges}
      onReject={handleRejectItem}
      onSelectItem={handleSelectItem}
      onToggleSelect={handleToggleSelect}
      onUnassign={handleUnassignItem}
    />
  );
}

export default function ReviewQueueContent() {
  return (
    <Suspense fallback={null}>
      <ReviewQueueContentContent />
    </Suspense>
  );
}
