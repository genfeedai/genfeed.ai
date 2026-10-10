import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  PageScope,
} from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import { buildPostsHrefFromApprovalQueue } from '@pages/posts/library/approval-queue-links.helpers';
import type { ReviewQueueViewProps } from '@props/publishing/review-queue-view.props';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import {
  ClipboardCheck,
  ExternalLink,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReviewGrid from './ReviewGrid';
import ReviewStatusFilters, {
  PUBLISH_HEADER_DROPDOWN_CLASS,
} from './ReviewStatusFilters';
import ReviewWorkspaceSurfaceAdapter from './ReviewWorkspaceSurfaceAdapter';

export function getTurboRunOptionLabel(turboRun: ITurboRunSummary): string {
  const shortId = turboRun.id.slice(-6);
  const status =
    typeof turboRun.status === 'string' && turboRun.status.trim()
      ? turboRun.status.replaceAll('_', ' ').toLowerCase()
      : '';
  return `${shortId} · ${turboRun.totalCount} items${status ? ` · ${status}` : ''}`;
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
  const translate = useTranslations('pages.publishing.review.approvalQueue');
  const { href } = useOrgUrl();
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
  const searchParams = useSearchParams();
  const postsHref = href(
    buildPostsHrefFromApprovalQueue(searchParams.toString()),
  );

  const turboRunOptions = useMemo(
    () =>
      turboRunList.map((turboRun) => ({
        label: getTurboRunOptionLabel(turboRun),
        value: turboRun.id,
      })),
    [turboRunList],
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

  useEffect(() => {
    if (turboRunOptions.length === 0) {
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
            onTurboRunChange(value);
          }}
          options={turboRunOptions}
          placeholder="Select batch"
          tooltip="Select review batch"
          value={activeTurboRunId ?? ''}
        />
        {canDiscardTurboRun ? (
          <Button
            className="h-8 shrink-0 gap-1.5 px-3 text-xs"
            icon={<Trash2 className="size-3.5" />}
            isDisabled={isActioning}
            label="Discard batch"
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
    isActioning,
    onTurboRunChange,
    onDiscardTurboRun,
    onFilterChange,
    setFiltersNode,
  ]);

  if (turboRunsError || hasInvalidTurboRunPayload) {
    return (
      <Card
        variant={CardVariant.DEFAULT}
        icon={TriangleAlert}
        label="Unable to load the review queue"
        description={getJsonApiErrorMessage(
          turboRunsError,
          'The review batches response was invalid or failed to load. Refresh the page and check the batches API.',
        )}
        bodyClassName="items-center py-12 text-center"
        iconWrapperClassName="bg-destructive/10 text-destructive"
        className="max-w-xl mx-auto"
      />
    );
  }

  if (turboRunList.length === 0) {
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
      {/* Explicit framing: this is the decision queue, not the content library. */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
        data-testid="approval-queue-framing"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {translate('title')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {translate('description')}
          </p>
        </div>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={postsHref}>
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {translate('openPosts')}
          </Link>
        </Button>
      </div>
      {isTurboRunLoading && !activeTurboRun ? (
        <Loading />
      ) : activeTurboRunError ? (
        <Card
          variant={CardVariant.DEFAULT}
          icon={TriangleAlert}
          label="Unable to load the selected batch"
          description="The batch list loaded, but the selected batch details could not be retrieved. Pick another batch or refresh."
          bodyClassName="items-center py-12 text-center"
          iconWrapperClassName="bg-warning/10 text-warning"
          className="max-w-xl mx-auto"
        />
      ) : activeTurboRun ? (
        <>
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
