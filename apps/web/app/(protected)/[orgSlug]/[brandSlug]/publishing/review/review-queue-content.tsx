'use client';

import Loading from '@ui/loading/default/Loading';
import { Suspense, useState } from 'react';
import ReviewQueueView from './components/ReviewQueueView';
import { useReviewInboxApprovals } from './useReviewInboxApprovals';
import { useReviewQueueContent } from './useReviewQueueContent';

function ReviewQueueContentContent() {
  const [search, setSearch] = useState('');
  const {
    activeFilters,
    activeItem,
    activeTurboRun,
    activeTurboRunError,
    activeTurboRunId,
    turboRunList,
    turboRunsError,
    canDiscardTurboRun,
    filterCounts,
    hasInvalidTurboRunPayload,
    isActioning,
    isTurboRunsLoading,
    isTurboRunLoading,
    isRefreshing,
    refreshQueue,
    selectedIds,
    selectedPostId,
    visibleItems,
    handleApproveItem,
    handleAssignItem,
    handleTurboRunChange,
    handleBulkAction,
    handleBulkRewrite,
    isRewriteStarting,
    rewriteProgress,
    rewritingIds,
    handleDiscardTurboRun,
    handleFilterChange,
    handleRequestChanges,
    handleRejectItem,
    handleSelectItem,
    handleToggleSelect,
    handleUnassignItem,
    setSelectedPostId,
  } = useReviewQueueContent(search);
  const approvals = useReviewInboxApprovals(search);

  if (isTurboRunsLoading) {
    return <Loading />;
  }

  return (
    <ReviewQueueView
      activeFilters={activeFilters}
      activeItem={activeItem}
      activeTurboRun={activeTurboRun}
      activeTurboRunError={activeTurboRunError as Error | null}
      activeTurboRunId={activeTurboRunId}
      approvals={approvals}
      turboRunList={turboRunList}
      turboRunsError={turboRunsError as Error | null}
      canDiscardTurboRun={canDiscardTurboRun}
      filterCounts={filterCounts}
      hasInvalidTurboRunPayload={hasInvalidTurboRunPayload}
      isActioning={isActioning}
      isTurboRunLoading={isTurboRunLoading}
      isRefreshing={isRefreshing}
      search={search}
      selectedIds={selectedIds}
      selectedPostId={selectedPostId}
      visibleItems={visibleItems}
      onApprove={handleApproveItem}
      onAssign={handleAssignItem}
      onTurboRunChange={handleTurboRunChange}
      onBulkApprove={() => handleBulkAction('approve')}
      onBulkReject={() => handleBulkAction('reject')}
      onBulkRewrite={handleBulkRewrite}
      isRewriteStarting={isRewriteStarting}
      rewriteProgress={rewriteProgress}
      rewritingIds={rewritingIds}
      onDiscardTurboRun={handleDiscardTurboRun}
      onClosePostDetail={() => setSelectedPostId(null)}
      onFilterChange={handleFilterChange}
      onRefresh={async () => {
        await Promise.all([refreshQueue(), approvals.refresh()]);
      }}
      onRequestChanges={handleRequestChanges}
      onSearchChange={setSearch}
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
