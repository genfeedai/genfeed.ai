import { CardVariant } from '@genfeedai/contracts';
import type { ReviewInboxApprovalsSectionProps } from '@props/publishing/review-inbox-approvals.props';
import Card from '@ui/card/Card';
import Pagination from '@ui/navigation/pagination/Pagination';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getReviewInboxItemPage,
  getReviewInboxPageCount,
  paginateReviewInboxItems,
} from './review-inbox.helpers';
import ReviewInboxApprovalsTable from './ReviewInboxApprovalsTable';

/**
 * Workflow review gates and MCP approvals above the Turbo run drafts. Renders
 * nothing while there is nothing to decide, so the drafts keep the page.
 */
export default function ReviewInboxApprovalsSection({
  approvals,
}: ReviewInboxApprovalsSectionProps) {
  const translate = useTranslations('pages.publishing.review.inbox');
  const { highlightedItemId, items, sourceFilters } = approvals;
  const [requestedPage, setRequestedPage] = useState(1);
  const handledHighlightRef = useRef<string | null>(null);
  const pageCount = getReviewInboxPageCount(items.length);
  const page = Math.min(requestedPage, pageCount);
  const visibleItems = useMemo(
    () => paginateReviewInboxItems(items, page),
    [items, page],
  );

  // A different source selection is a different list: start from its top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets on the filter change only
  useEffect(() => {
    setRequestedPage(1);
  }, [sourceFilters]);

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
      <Card
        variant={CardVariant.DEFAULT}
        icon={TriangleAlert}
        label={translate('loadFailed')}
        bodyClassName="items-center py-6 text-center"
        iconWrapperClassName="bg-warning/10 text-warning"
        className="mx-auto mb-6 max-w-xl"
      />
    );
  }

  if (items.length === 0 && !approvals.isHighlightedItemMissing) {
    return null;
  }

  return (
    <section className="mb-6" data-testid="review-inbox-approvals">
      {approvals.isHighlightedItemMissing ? (
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {translate('highlightMissing')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <>
          <ReviewInboxApprovalsTable
            decidingItemId={approvals.decidingItemId}
            highlightedItemId={highlightedItemId}
            items={visibleItems}
            onDecide={approvals.onDecide}
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
      ) : null}
    </section>
  );
}
