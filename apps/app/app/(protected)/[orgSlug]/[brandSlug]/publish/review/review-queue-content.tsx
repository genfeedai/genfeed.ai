'use client';

import Loading from '@ui/loading/default/Loading';
import { Suspense } from 'react';
import ReviewQueueView from './components/ReviewQueueView';
import { useReviewQueueContent } from './useReviewQueueContent';

function ReviewQueueContentContent() {
  const {
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
    isBatchesLoading,
    isBatchLoading,
    selectedIds,
    selectedPostId,
    visibleItems,
    handleApproveItem,
    handleBatchChange,
    handleBulkAction,
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
      activeFilter={activeFilter}
      activeItem={activeItem}
      activeBatch={activeBatch}
      activeBatchError={activeBatchError as Error | null}
      activeBatchId={activeBatchId}
      batchList={batchList}
      batchesError={batchesError as Error | null}
      filterCounts={filterCounts}
      hasInvalidBatchPayload={hasInvalidBatchPayload}
      isActioning={isActioning}
      isBatchLoading={isBatchLoading}
      selectedIds={selectedIds}
      selectedPostId={selectedPostId}
      visibleItems={visibleItems}
      onApprove={handleApproveItem}
      onBatchChange={handleBatchChange}
      onBulkApprove={() => handleBulkAction('approve')}
      onBulkReject={() => handleBulkAction('reject')}
      onClosePostDetail={() => setSelectedPostId(null)}
      onFilterChange={handleFilterChange}
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
