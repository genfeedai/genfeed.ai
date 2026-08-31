'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Check, Sparkles, X } from 'lucide-react';

import type { ReviewPanelItem } from './review-panel.types';
import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
  isRejected,
} from './review-state';

interface ReviewDecisionPanelProps {
  feedback: string;
  isActioning: boolean;
  isReady: boolean;
  isSelected: boolean;
  item: ReviewPanelItem;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  setFeedback: (value: string) => void;
}

function getApproveLabel(item: ReviewPanelItem): string {
  if (item.postId && !item.scheduledDate) {
    return 'Approve and open draft';
  }

  return 'Approve and schedule';
}

function getResolvedDecisionLabel(item: ReviewPanelItem): string {
  if (isApproved(item)) {
    return 'This item has already been approved.';
  }

  if (isChangesRequested(item)) {
    return 'Changes were requested for this item.';
  }

  if (isRejected(item)) {
    return 'This item was rejected.';
  }

  return 'This item is not currently actionable.';
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
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Decision</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Approve, request changes, or reject this post.
        </p>
      </div>

      <Textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="Revision guidance or rejection context"
        aria-label="Review notes"
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
            Request changes
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            isDisabled={isActioning}
            onClick={() => onApprove(item.id)}
            className="w-full justify-start gap-2"
            icon={<Check className="size-3.5" />}
          >
            {getApproveLabel(item)}
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
            Reject
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
                ? 'Remove from bulk selection'
                : 'Add to bulk selection'}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {getResolvedDecisionLabel(item)}
        </p>
      )}
    </div>
  );
}
