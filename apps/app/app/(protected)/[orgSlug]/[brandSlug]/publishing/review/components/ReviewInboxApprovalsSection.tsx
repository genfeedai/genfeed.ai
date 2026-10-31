import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import type { IReviewInboxItem } from '@genfeedai/contracts/interfaces';
import type { ReviewInboxApprovalsSectionProps } from '@props/publishing/review-inbox-approvals.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import CollectionSection from '@ui/collection/CollectionSection';
import Pagination from '@ui/navigation/pagination/Pagination';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReviewInboxApprovalsTable from './ReviewInboxApprovalsTable';
import ReviewInboxBulkBar from './ReviewInboxBulkBar';
import {
  getReviewInboxItemPage,
  getReviewInboxPageCount,
  paginateReviewInboxItems,
} from './review-inbox.helpers';

/**
 * Workflow review gates and MCP approvals above the Turbo run drafts. Renders
 * nothing while there is nothing to decide, so the drafts keep the page. With
 * a `title` the requests become a headed "Needs you" section; without one the
 * table stands alone, because a heading only earns its place when it splits
 * the page.
 */
export default function ReviewInboxApprovalsSection({
  approvals,
  title,
}: ReviewInboxApprovalsSectionProps) {
  const translate = useTranslations('pages.publishing.review.inbox');
  const { openConfirm } = useConfirmModal();
  const { highlightedItemId, items, sourceFilters } = approvals;
  const [requestedPage, setRequestedPage] = useState(1);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const handledHighlightRef = useRef<string | null>(null);
  const pageCount = getReviewInboxPageCount(items.length);
  const page = Math.min(requestedPage, pageCount);
  const visibleItems = useMemo(
    () => paginateReviewInboxItems(items, page),
    [items, page],
  );

  // Only rows that can be decided are ever picked, and a row another reviewer
  // resolved drops out of the selection with the refetch.
  const resolvableItems = useMemo(
    () => items.filter((item) => item.isResolvable),
    [items],
  );
  const selectedItems = useMemo(
    () => resolvableItems.filter((item) => pickedIds.includes(item.id)),
    [pickedIds, resolvableItems],
  );
  const selectedIds = useMemo(
    () => selectedItems.map((item) => item.id),
    [selectedItems],
  );

  // A different source selection is a different list: start from its top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets on the filter change only
  useEffect(() => {
    setRequestedPage(1);
    setPickedIds([]);
  }, [sourceFilters]);

  // The table's own checkboxes see one page; the rest of the selection stays.
  const handleSelectionChange = useCallback(
    (pageSelectedIds: string[]) => {
      const pageIds = new Set(visibleItems.map((item) => item.id));
      const resolvableIds = new Set(resolvableItems.map((item) => item.id));
      setPickedIds([
        ...selectedIds.filter((id) => !pageIds.has(id)),
        ...pageSelectedIds.filter((id) => resolvableIds.has(id)),
      ]);
    },
    [resolvableItems, selectedIds, visibleItems],
  );

  const handleBulkDecision = useCallback(
    (decision: 'approve' | 'reject') => {
      const targets: IReviewInboxItem[] = selectedItems;
      const credits = targets.reduce(
        (sum, item) => sum + (item.estimatedCredits ?? 0),
        0,
      );
      openConfirm({
        confirmLabel: translate(decision),
        isError: decision === 'reject',
        label: translate(
          decision === 'reject' ? 'bulkRejectTitle' : 'bulkApproveTitle',
          { count: targets.length },
        ),
        message: translate(
          decision === 'reject' ? 'bulkRejectMessage' : 'bulkApproveMessage',
          { count: targets.length, credits },
        ),
        onConfirm: async () => {
          await approvals.onDecideMany(targets, decision);
          setPickedIds([]);
        },
      });
    },
    [approvals, openConfirm, selectedItems, translate],
  );

  // A deep link lands once on the page holding its row, so a later refetch
  // does not pull the reviewer back from the page they moved to.
  useEffect(() => {
    if (!highlightedItemId || handledHighlightRef.current === highlightedItemId)
      return;
    const highlightedPage = getReviewInboxItemPage(items, highlightedItemId);
    if (highlightedPage) {
      handledHighlightRef.current = highlightedItemId;
      setRequestedPage(highlightedPage);
    }
  }, [highlightedItemId, items]);

  if (approvals.error) {
    return (
      <CardEmpty
        icon={TriangleAlert}
        label={translate('loadFailed')}
        className="mx-auto mb-6 max-w-xl"
      />
    );
  }

  if (items.length === 0 && !approvals.isHighlightedItemMissing) {
    return null;
  }

  const table =
    items.length > 0 ? (
      <>
        {selectedIds.length > 0 ? (
          <div className="mb-3">
            <ReviewInboxBulkBar
              isDisabled={approvals.isBulkDeciding}
              onApprove={() => handleBulkDecision('approve')}
              onClear={() => setPickedIds([])}
              onReject={() => handleBulkDecision('reject')}
              onSelectAll={() =>
                setPickedIds(resolvableItems.map((item) => item.id))
              }
              selectedCount={selectedIds.length}
              totalCount={resolvableItems.length}
            />
          </div>
        ) : null}
        <ReviewInboxApprovalsTable
          decidingItemId={approvals.decidingItemId}
          highlightedItemId={highlightedItemId}
          isBulkDeciding={approvals.isBulkDeciding}
          items={visibleItems}
          onDecide={approvals.onDecide}
          onSelectionChange={handleSelectionChange}
          selectedIds={selectedIds}
        />
        <div className="mt-4">
          <Pagination
            currentPage={page}
            onPageChange={setRequestedPage}
            totalItems={items.length}
            totalLabel={translate('totalLabel')}
            totalPages={pageCount}
          />
        </div>
      </>
    ) : null;

  return (
    <section className="mb-6" data-testid="review-inbox-approvals">
      {approvals.isHighlightedItemMissing ? (
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {translate('highlightMissing')}
        </p>
      ) : null}
      {title ? (
        <CollectionSection itemCount={items.length} title={title}>
          {table}
        </CollectionSection>
      ) : (
        table
      )}
    </section>
  );
}
