import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  ButtonSize,
  ButtonVariant,
  PageScope,
  TurboRunStatus,
} from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import CollectionSection from '@ui/collection/CollectionSection';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { EmptyStateCard } from '@ui/primitives/empty-state';
import { ClipboardCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import type { ReviewQueueViewProps } from '@/features/posts/props/review-queue-view.props';
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
  search,
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
  onSearchChange,
  onSelectItem,
  onToggleSelect,
  onUnassign,
}: ReviewQueueViewProps) {
  const { setFiltersNode, setIsRefreshing, setLeadingNode, setRefresh } =
    usePostsLayout();
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
  const isSearching = search.trim() !== '';
  // A search that matches nothing must not take the Filters menu away.
  const hasSourceFilter =
    turboRunOptions.length > 0 ||
    approvals.items.length > 0 ||
    approvals.sourceFilters.length > 0 ||
    isSearching;
  const { onSourceFilterChange, sourceFilters } = approvals;

  // The page's one search, with the Filters menu (source, status, batch)
  // attached inside it — no separate Filters button.
  useEffect(() => {
    setLeadingNode(
      <SearchField
        ariaLabel={translateReview('queue.search')}
        onSearch={onSearchChange}
        placeholder={translateReview('queue.search')}
        value={search}
      >
        {hasSourceFilter ? (
          <ReviewFilterMenu
            activeFilters={activeFilters}
            activeSources={sourceFilters}
            activeTurboRunId={activeTurboRunId}
            filterCounts={filterCounts}
            hasTurboControls={hasTurboControls}
            isAttached
            onFilterChange={onFilterChange}
            onSourceChange={onSourceFilterChange}
            onTurboRunChange={onTurboRunChange}
            turboRunOptions={turboRunOptions}
          />
        ) : null}
      </SearchField>,
    );

    return () => {
      setLeadingNode(null);
    };
  }, [
    activeFilters,
    activeTurboRunId,
    filterCounts,
    hasSourceFilter,
    hasTurboControls,
    onFilterChange,
    onSearchChange,
    onSourceFilterChange,
    onTurboRunChange,
    search,
    setLeadingNode,
    sourceFilters,
    translateReview,
    turboRunOptions,
  ]);

  // Discard batch stays in the action rail beside New content / refresh.
  const hasDiscardAction = hasTurboControls && canDiscardTurboRun;
  useEffect(() => {
    if (!hasDiscardAction) {
      setFiltersNode(null);
      return () => {
        setFiltersNode(null);
      };
    }

    setFiltersNode(
      <Button
        className="h-8 shrink-0 gap-1.5 px-3 text-xs"
        icon={<Trash2 className="size-3.5" />}
        isDisabled={isActioning}
        label={translateReview('queue.discardBatch')}
        onClick={onDiscardTurboRun}
        size={ButtonSize.SM}
        variant={ButtonVariant.DESTRUCTIVE}
        withWrapper={false}
      />,
    );

    return () => {
      setFiltersNode(null);
    };
  }, [
    hasDiscardAction,
    isActioning,
    onDiscardTurboRun,
    setFiltersNode,
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

  const emptySearchCard = (
    <EmptyStateCard
      icon={ClipboardCheck}
      title={translateReview('queue.emptySearchTitle')}
      description={translateReview('queue.emptySearchDescription')}
      className="max-w-xl mx-auto"
    />
  );

  if (!isTurboQueueVisible) {
    if (approvals.isLoading) {
      return <Loading />;
    }
    if (!hasApprovalsContent) {
      if (isSearching) {
        return emptySearchCard;
      }
      return (
        <EmptyStateCard
          icon={ClipboardCheck}
          title={translateInbox('emptyFilteredTitle')}
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
        <EmptyStateCard
          icon={TriangleAlert}
          title={translateReview('queue.loadFailed')}
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
    if (isSearching) {
      return emptySearchCard;
    }
    return (
      <EmptyStateCard
        icon={ClipboardCheck}
        title={translateReview('queue.emptyTitle')}
        description={translateReview('queue.emptyDescription')}
        className="max-w-xl mx-auto"
      />
    );
  }

  if (
    isSearching &&
    visibleItems.length === 0 &&
    !hasApprovalsContent &&
    !isTurboRunLoading &&
    !activeTurboRunError &&
    activeTurboRun
  ) {
    return emptySearchCard;
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
        <EmptyStateCard
          icon={TriangleAlert}
          title={translateReview('queue.batchLoadFailed')}
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
        <EmptyStateCard
          icon={TriangleAlert}
          title={translateReview('queue.noDetails')}
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
