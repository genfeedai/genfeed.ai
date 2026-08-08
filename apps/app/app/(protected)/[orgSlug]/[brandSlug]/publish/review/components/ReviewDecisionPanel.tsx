'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Check, Sparkles, X } from 'lucide-react';

import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
} from './review-state';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

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

  if (item.reviewDecision === 'rejected') {
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
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            isDisabled={isActioning}
            onClick={() => onApprove(item.id)}
            className="w-full gap-1.5"
          >
            <Check className="size-3.5" />
            {getApproveLabel(item)}
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            isDisabled={isActioning}
            onClick={() => onRequestChanges(item.id, feedback)}
            className="w-full gap-1.5"
          >
            <Sparkles className="size-3.5" />
            Request changes
          </Button>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DESTRUCTIVE}
            withWrapper={false}
            isDisabled={isActioning}
            onClick={() => onReject(item.id, feedback)}
            className="w-full gap-1.5"
          >
            <X className="size-3.5" />
            Reject
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {getResolvedDecisionLabel(item)}
        </p>
      )}

      {isReadyToReview(item) ? (
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          onClick={() => onToggleSelect(item.id)}
          className="w-full"
        >
          {isSelected ? 'Remove from bulk selection' : 'Add to bulk selection'}
        </Button>
      ) : null}
    </div>
  );
}
