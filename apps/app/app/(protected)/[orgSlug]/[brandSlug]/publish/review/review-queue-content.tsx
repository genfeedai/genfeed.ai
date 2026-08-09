'use client';

import Loading from '@ui/loading/default/Loading';
import { Suspense } from 'react';
import ReviewQueueView from './components/ReviewQueueView';
import { useReviewQueueContent } from './useReviewQueueContent';

function ReviewQueueContentContent() {
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
    handleBatchChange,
    handleBulkAction,
    handleDiscardBatch,
    handleFilterChange,
    handleRequestChanges,
    handleRejectItem,
    handleSelectItem,
    handleToggleSelect,
    setSelectedPostId,
  } = useReviewQueueContent();

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
      onBatchChange={handleBatchChange}
      onBulkApprove={() => handleBulkAction('approve')}
      onBulkReject={() => handleBulkAction('reject')}
      onDiscardBatch={handleDiscardBatch}
      onClosePostDetail={() => setSelectedPostId(null)}
      onFilterChange={handleFilterChange}
      onRefresh={refreshQueue}
      onRequestChanges={handleRequestChanges}
      onReject={handleRejectItem}
      onSelectItem={handleSelectItem}
      onToggleSelect={handleToggleSelect}
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
