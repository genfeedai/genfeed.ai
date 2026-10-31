import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Check, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReviewDecisionPanelProps } from '@/features/posts/props/review-decision-panel.props';
import type { ReviewPanelItem } from '@/props/publishing/review-panel-item.props';

import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
  isRejected,
} from './review-state';

function getApproveLabel(
  item: ReviewPanelItem,
  translate: ReturnType<typeof useTranslations>,
): string {
  if (item.postId && !item.scheduledDate) {
    return translate('decision.approveDraft');
  }

  return translate('decision.approveSchedule');
}

function getResolvedDecisionLabel(
  item: ReviewPanelItem,
  translate: ReturnType<typeof useTranslations>,
): string {
  if (isApproved(item)) {
    return translate('decision.alreadyApproved');
  }

  if (isChangesRequested(item)) {
    return translate('decision.changesRequested');
  }

  if (isRejected(item)) {
    return translate('decision.alreadyRejected');
  }

  return translate('decision.notActionable');
}

export default function ReviewDecisionPanel({
  feedback,
  isActioning,
  isReady,
  isSelected,
  item,
  onApprove,
  onReject,
  onRequestChanges,
  onToggleSelect,
  setFeedback,
}: ReviewDecisionPanelProps) {
  const translate = useTranslations('pages.publishing.review');
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          {translate('decision.title')}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {translate('decision.description')}
        </p>
      </div>

      <Textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder={translate('decision.placeholder')}
        aria-label={translate('decision.notes')}
        className="min-h-20 w-full rounded-md"
      />

      {isReady ? (
        <div className="flex flex-col gap-2">
          {/* Match ModalConfirm / app-wide grammar: secondary paths first,
              primary next, destructive last (right/bottom). */}
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            isDisabled={isActioning}
            onClick={() => onRequestChanges(item.id, feedback)}
            className="w-full justify-start gap-2"
            icon={<Sparkles className="size-3.5" />}
          >
            {translate('decision.requestChanges')}
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            isDisabled={isActioning}
            action="publishing.review-approve"
            onClick={() => onApprove(item.id)}
            className="w-full justify-start gap-2"
            icon={<Check className="size-3.5" />}
          >
            {getApproveLabel(item, translate)}
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DESTRUCTIVE}
            withWrapper={false}
            isDisabled={isActioning}
            onClick={() => onReject(item.id, feedback)}
            className="w-full justify-start gap-2"
            icon={<X className="size-3.5" />}
          >
            {translate('decision.reject')}
          </Button>
          {isReadyToReview(item) ? (
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              onClick={() => onToggleSelect(item.id)}
              className="w-full justify-start"
            >
              {isSelected
                ? translate('decision.removeSelection')
                : translate('decision.addSelection')}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {getResolvedDecisionLabel(item, translate)}
        </p>
      )}
    </div>
  );
}
