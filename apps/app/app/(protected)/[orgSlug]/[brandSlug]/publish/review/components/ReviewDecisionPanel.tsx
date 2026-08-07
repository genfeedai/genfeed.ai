'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
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

function getResolvedDecisionStatus(item: ReviewPanelItem): {
  className: string;
  label: string;
} {
  if (isApproved(item)) {
    return {
      className: 'border border-success/25 bg-success/10 text-success',
      label: 'This item has already been approved.',
    };
  }

  if (isChangesRequested(item)) {
    return {
      className: 'border border-warning/25 bg-warning/10 text-warning',
      label: 'Changes were requested for this item.',
    };
  }

  if (item.reviewDecision === 'rejected') {
    return {
      className:
        'border border-destructive/25 bg-destructive/10 text-destructive',
      label: 'This item was rejected.',
    };
  }

  return {
    className: 'text-foreground/55',
    label: 'This item is not currently actionable.',
  };
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
    <InsetSurface className="p-4" tone="contrast">
      <h3 className="text-sm font-medium text-foreground">Decision</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Approve, request changes, or reject this post.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <span className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Notes
          </span>
          <Textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Revision guidance or rejection context"
            className="min-h-20 w-full rounded-md"
          />
        </span>

        {isReady ? (
          <>
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
          </>
        ) : (
          <InsetSurface
            className={`px-3 py-2.5 text-sm ${getResolvedDecisionStatus(item).className}`}
            density="compact"
          >
            {getResolvedDecisionStatus(item).label}
          </InsetSurface>
        )}

        {isReadyToReview(item) ? (
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={() => onToggleSelect(item.id)}
            className="w-full"
          >
            {isSelected
              ? 'Remove from bulk selection'
              : 'Add to bulk selection'}
          </Button>
        ) : null}
      </div>
    </InsetSurface>
  );
}
