'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { HiCheck, HiSparkles, HiXMark } from 'react-icons/hi2';
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
    <InsetSurface className="p-5" tone="contrast">
      <h3 className="text-sm font-medium text-foreground">Decision</h3>
      <p className="mt-1 text-sm text-foreground/55">
        Keep momentum by making the decision from this panel.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <span className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
            Reviewer notes
          </span>
          <Textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Add revision guidance or rejection context"
            className="min-h-28 w-full rounded-xl border border-white/10 bg-muted/40 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/35 focus:border-white/20"
          />
        </span>

        {isReady ? (
          <>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              isDisabled={isActioning}
              onClick={() => onApprove(item.id)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <HiCheck className="size-4" />
              {getApproveLabel(item)}
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              isDisabled={isActioning}
              onClick={() => onRequestChanges(item.id, feedback)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
            >
              <HiSparkles className="size-4" />
              Request changes
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              isDisabled={isActioning}
              onClick={() => onReject(item.id, feedback)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
            >
              <HiXMark className="size-4" />
              Reject and remove
            </Button>
          </>
        ) : (
          <InsetSurface
            className="px-4 py-3 text-sm text-foreground/55"
            density="compact"
          >
            {isApproved(item)
              ? 'This item has already been approved.'
              : isChangesRequested(item)
                ? 'Changes were requested for this item.'
                : item.reviewDecision === 'rejected'
                  ? 'This item was rejected.'
                  : 'This item is not currently actionable.'}
          </InsetSurface>
        )}

        {isReadyToReview(item) && (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => onToggleSelect(item.id)}
            className="rounded-xl border border-white/10 bg-muted/30 px-4 py-3 text-sm font-medium text-foreground/75 transition-colors hover:border-white/20 hover:bg-muted/60"
          >
            {isSelected
              ? 'Remove from bulk selection'
              : 'Add to bulk selection'}
          </Button>
        )}
      </div>
    </InsetSurface>
  );
}
