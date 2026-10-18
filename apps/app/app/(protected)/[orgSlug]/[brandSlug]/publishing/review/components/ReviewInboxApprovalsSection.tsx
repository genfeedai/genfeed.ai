import { CardVariant } from '@genfeedai/contracts';
import type { ReviewInboxApprovalsSectionProps } from '@props/publishing/review-inbox-approvals.props';
import Card from '@ui/card/Card';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ReviewInboxApprovalsTable from './ReviewInboxApprovalsTable';

/**
 * Workflow review gates and MCP approvals above the Turbo run drafts. Renders
 * nothing while there is nothing to decide, so the drafts keep the page.
 */
export default function ReviewInboxApprovalsSection({
  approvals,
}: ReviewInboxApprovalsSectionProps) {
  const translate = useTranslations('pages.publishing.review.inbox');

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

  if (approvals.items.length === 0 && !approvals.isHighlightedItemMissing) {
    return null;
  }

  return (
    <section className="mb-6" data-testid="review-inbox-approvals">
      <div className="mb-3 min-w-0">
        <h2 className="text-sm font-semibold text-foreground">
          {translate('title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      {approvals.isHighlightedItemMissing ? (
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {translate('highlightMissing')}
        </p>
      ) : null}
      {approvals.items.length > 0 ? (
        <ReviewInboxApprovalsTable
          decidingItemId={approvals.decidingItemId}
          highlightedItemId={approvals.highlightedItemId}
          items={approvals.items}
          onDecide={approvals.onDecide}
        />
      ) : null}
    </section>
  );
}
