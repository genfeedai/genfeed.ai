import { CardVariant } from '@genfeedai/contracts';
import type { ReviewInboxApprovalsSectionProps } from '@props/publishing/review-inbox-approvals.props';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import Pagination from '@ui/navigation/pagination/Pagination';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReviewInboxApprovalsTable from './ReviewInboxApprovalsTable';
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

  const table =
    items.length > 0 ? (
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
