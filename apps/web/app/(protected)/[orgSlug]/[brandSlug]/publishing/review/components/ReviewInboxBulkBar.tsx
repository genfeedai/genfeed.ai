import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReviewInboxBulkBarProps } from '@/props/publishing/review-inbox-approvals.props';

/**
 * Acts on the requests ticked in the table. "Select all" reaches past the
 * page on screen, so a whole backlog can be rejected in two clicks.
 */
export default function ReviewInboxBulkBar({
  selectedCount,
  totalCount,
  isDisabled,
  onApprove,
  onReject,
  onClear,
  onSelectAll,
}: ReviewInboxBulkBarProps) {
  const translate = useTranslations('pages.publishing.review.inbox');

  return (
    <Card
      // Card body defaults to flex-col — force a single horizontal row.
      bodyClassName="flex flex-row flex-wrap items-center justify-between gap-2 !p-3"
      className="bg-card"
      variant={CardVariant.DEFAULT}
    >
      <p className="flex shrink-0 flex-wrap items-center gap-x-3 text-xs text-foreground/70">
        <span>
          <span className="font-semibold text-foreground">{selectedCount}</span>{' '}
          {translate('selected')}
        </span>
        {selectedCount < totalCount ? (
          <Button
            isDisabled={isDisabled}
            label={translate('selectAll', { count: totalCount })}
            onClick={onSelectAll}
            size={ButtonSize.SM}
            variant={ButtonVariant.LINK}
            withWrapper={false}
          />
        ) : null}
        <Button
          isDisabled={isDisabled}
          label={translate('clearSelection')}
          onClick={onClear}
          size={ButtonSize.SM}
          variant={ButtonVariant.LINK}
          withWrapper={false}
        />
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          className="h-7 gap-1 px-2 text-xs"
          isDisabled={isDisabled}
          onClick={onApprove}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <Check className="size-3.5" />
          {translate('approve')}
        </Button>
        <Button
          className="h-7 gap-1 px-2 text-xs"
          isDisabled={isDisabled}
          onClick={onReject}
          size={ButtonSize.SM}
          variant={ButtonVariant.DESTRUCTIVE}
          withWrapper={false}
        >
          <X className="size-3.5" />
          {translate('reject')}
        </Button>
      </div>
    </Card>
  );
}
