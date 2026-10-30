import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  ButtonSize,
  ButtonVariant,
  PageScope,
  TurboRunStatus,
} from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import type { ReviewQueueViewProps } from '@props/publishing/review-queue-view.props';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import CardEmpty from '@ui/card/empty/CardEmpty';
import CollectionSection from '@ui/collection/CollectionSection';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { ClipboardCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAgentSourceVisible } from '../useReviewInboxApprovals';
import ReviewFilterMenu from './ReviewFilterMenu';
import ReviewGrid from './ReviewGrid';
import ReviewInboxApprovalsSection from './ReviewInboxApprovalsSection';
import ReviewWorkspaceSurfaceAdapter from './ReviewWorkspaceSurfaceAdapter';

export function getTurboRunOptionLabel(
  turboRun: ITurboRunSummary,
  translate: ReturnType<typeof useTranslations>,
): string {
  const shortId = turboRun.id.slice(-6);
  const status =
    typeof turboRun.status === 'string' && turboRun.status.trim()
      ? Object.values(TurboRunStatus).some((value) => value === turboRun.status)
        ? translate(`queue.batchStatus.${turboRun.status}`)
        : turboRun.status.replaceAll('_', ' ').toLowerCase()
      : '';
  return translate(
    status ? 'queue.batchOptionWithStatus' : 'queue.batchOption',
    { id: shortId, count: turboRun.totalCount, status },
  );
}

/**
 * Review queue body only — publish layout owns Container / New post / refresh.
 * Status filters, batch picker, and Discard batch register into the layout
 * action rail (sub topbar) via PostsLayoutContext.setFiltersNode.
 */
export default function ReviewQueueView({
  activeFilters,
  activeItem,
  activeTurboRun,
  activeTurboRunError,
  activeTurboRunId,
  approvals,
  turboRunList,
  turboRunsError,
  canDiscardTurboRun,
  filterCounts,
  hasInvalidTurboRunPayload,
  isActioning,
  isTurboRunLoading,
  isRefreshing = false,
  selectedIds,
  isRewriteStarting,
  rewriteProgress,
  rewritingIds,
  selectedPostId,
  visibleItems,
  onApprove,
  onAssign,
  onTurboRunChange,
  onBulkApprove,
  onBulkReject,
  onBulkRewrite,
  onDiscardTurboRun,
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
  const translateReview = useTranslations('pages.publishing.review');
  const translateInbox = useTranslations('pages.publishing.review.inbox');
  // Rows the operator tapped, as opposed to the first item the queue picks
  // for them: only a tap opens the mobile drawer, and every tap reveals it.
  const [rowTap, setRowTap] = useState<{
    readonly count: number;
    readonly itemId: string | null;
  }>({ count: 0, itemId: null });
  const handleSelectRow = useCallback(
    (itemId: string) => {
      setRowTap((current) => ({ count: current.count + 1, itemId }));
      onSelectItem(itemId);
    },
    [onSelectItem],
  );
  // A tap only vouches for the row it selected: once the queue moves to
  // another row, a later automatic return to the tapped one stays automatic.
  const activeItemId = activeItem?.id ?? null;
  useEffect(() => {
    setRowTap((current) =>
      current.itemId && current.itemId !== activeItemId
        ? { count: current.count, itemId: null }
        : current,
    );
  }, [activeItemId]);

  const turboRunOptions = useMemo(
    () =>
      turboRunList.map((turboRun) => ({
        label: getTurboRunOptionLabel(turboRun, translateReview),
        value: turboRun.id,
      })),
    [turboRunList, translateReview],
  );

  useEffect(() => {
    setRefresh(() => onRefresh);
    return () => {
      setRefresh(() => () => undefined);
    };
  }, [onRefresh, setRefresh]);

  useEffect(() => {
    setIsRefreshing(isRefreshing || isTurboRunLoading);
  }, [isTurboRunLoading, isRefreshing, setIsRefreshing]);

  const isTurboQueueVisible = isAgentSourceVisible(approvals.sourceFilters);
  const hasTurboControls = isTurboQueueVisible && turboRunOptions.length > 0;
  const hasSourceFilter =
    turboRunOptions.length > 0 ||
    approvals.items.length > 0 ||
    approvals.sourceFilters.length > 0;
  const { onSourceFilterChange, sourceFilters } = approvals;

  useEffect(() => {
    if (!hasSourceFilter) {
      setFiltersNode(null);
      return () => {
        setFiltersNode(null);
      };
    }

    // Sub topbar action rail: source, then status + batch (+ discard) beside
    // New content / refresh — same vertical level, no page-body orphan row.
    setFiltersNode(
      <div className="flex min-w-0 items-center gap-2">
        <ReviewFilterMenu
          activeFilters={activeFilters}
          activeSources={sourceFilters}
          activeTurboRunId={activeTurboRunId}
          filterCounts={filterCounts}
          hasTurboControls={hasTurboControls}
          onFilterChange={onFilterChange}
          onSourceChange={onSourceFilterChange}
          onTurboRunChange={onTurboRunChange}
          turboRunOptions={turboRunOptions}
        />
        {hasTurboControls && canDiscardTurboRun ? (
          <Button
            className="h-8 shrink-0 gap-1.5 px-3 text-xs"
            icon={<Trash2 className="size-3.5" />}
            isDisabled={isActioning}
            label={translateReview('queue.discardBatch')}
            onClick={onDiscardTurboRun}
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
    activeTurboRunId,
    activeFilters,
    turboRunOptions,
    canDiscardTurboRun,
    filterCounts,
    hasSourceFilter,
    hasTurboControls,
    isActioning,
    onSourceFilterChange,
    onTurboRunChange,
    onDiscardTurboRun,
    onFilterChange,
    setFiltersNode,
    sourceFilters,
    translateReview,
  ]);

  // The requests and the batch drafts only get headings when both are on the
  // page, so a lone table never carries a title that splits nothing.
  const hasSplitSections =
    approvals.items.length > 0 &&
    isTurboQueueVisible &&
    turboRunList.length > 0;
  const approvalsSection = (
    <ReviewInboxApprovalsSection
      approvals={approvals}
      title={hasSplitSections ? translateInbox('needsYou') : undefined}
    />
  );

  // An error, a missing deep-linked row or a row to decide all render in the
  // approvals section; with none of them it would render nothing.
  const hasApprovalsContent =
    approvals.items.length > 0 ||
    approvals.isHighlightedItemMissing ||
    approvals.error !== null;

  if (!isTurboQueueVisible) {
    if (approvals.isLoading) {
      return <Loading />;
    }
    if (!hasApprovalsContent) {
      return (
        <CardEmpty
          icon={ClipboardCheck}
          label={translateInbox('emptyFilteredTitle')}
          description={translateInbox('emptyFilteredDescription')}
          className="max-w-xl mx-auto"
        />
      );
    }
    return approvalsSection;
  }

  if (turboRunsError || hasInvalidTurboRunPayload) {
    return (
      <>
        {approvalsSection}
        <CardEmpty
          icon={TriangleAlert}
          label={translateReview('queue.loadFailed')}
          description={getJsonApiErrorMessage(
            turboRunsError,
            translateReview('queue.invalidResponse'),
          )}
          className="max-w-xl mx-auto"
        />
      </>
    );
  }

  if (turboRunList.length === 0) {
    if (approvals.isLoading) {
      return <Loading />;
    }
    if (hasApprovalsContent) {
      return approvalsSection;
    }
    return (
      <CardEmpty
        icon={ClipboardCheck}
        label={translateReview('queue.emptyTitle')}
        description={translateReview('queue.emptyDescription')}
        className="max-w-xl mx-auto"
      />
    );
  }

  const draftsGrid = (
    <ReviewGrid
      activeItem={activeItem}
      isActioning={isActioning}
      items={visibleItems}
      selectedIds={selectedIds}
      isRewriteStarting={isRewriteStarting}
      rewriteProgress={rewriteProgress}
      rewritingIds={rewritingIds}
      onBulkApprove={onBulkApprove}
      onBulkReject={onBulkReject}
      onBulkRewrite={onBulkRewrite}
      onSelectItem={handleSelectRow}
      onToggleSelect={onToggleSelect}
    />
  );

  return (
    <>
      {approvalsSection}
      {isTurboRunLoading && !activeTurboRun ? (
        <Loading />
      ) : activeTurboRunError ? (
        <CardEmpty
          icon={TriangleAlert}
          label={translateReview('queue.batchLoadFailed')}
          description={translateReview('queue.batchLoadDescription')}
          className="max-w-xl mx-auto"
        />
      ) : activeTurboRun ? (
        <>
          {activeTurboRun.learningSignals ? (
            <p className="text-xs text-foreground/60">
              {translateReview('queue.learningSignals', {
                approvals: activeTurboRun.learningSignals.approvalCount,
                rejections: activeTurboRun.learningSignals.rejectionCount,
              })}
            </p>
          ) : null}
          <ReviewWorkspaceSurfaceAdapter
            activeItem={activeItem}
            activeItemOrigin={
              activeItem && activeItem.id === rowTap.itemId
                ? 'user'
                : 'automatic'
            }
            revealRequest={rowTap.count}
            isActioning={isActioning}
            isSelected={activeItem ? selectedIds.has(activeItem.id) : false}
            onApprove={onApprove}
            onAssign={onAssign}
            onReject={onReject}
            onRequestChanges={onRequestChanges}
            onToggleSelect={onToggleSelect}
            onUnassign={onUnassign}
          />
          {hasSplitSections ? (
            <CollectionSection title={translateReview('queue.draftsTitle')}>
              {draftsGrid}
            </CollectionSection>
          ) : (
            draftsGrid
          )}
        </>
      ) : (
        <CardEmpty
          icon={TriangleAlert}
          label={translateReview('queue.noDetails')}
          description={translateReview('queue.noDetailsDescription')}
          className="max-w-xl mx-auto"
        />
      )}
      <PostDetailPanel
        postId={selectedPostId}
        scope={PageScope.PUBLISHING}
        onClose={onClosePostDetail}
      />
    </>
  );
}
