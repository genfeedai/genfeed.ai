'use client';

import { ReviewDecision } from '@genfeedai/contracts';
import type { PostSidebarLineageProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import { useTranslations } from 'next-intl';

type ReviewDecisionKey = 'approved' | 'rejected' | 'requestChanges' | 'unset';

const REVIEW_DECISION_KEYS: Record<ReviewDecision, ReviewDecisionKey> = {
  [ReviewDecision.APPROVED]: 'approved',
  [ReviewDecision.REJECTED]: 'rejected',
  [ReviewDecision.REQUEST_CHANGES]: 'requestChanges',
  [ReviewDecision.UNSET]: 'unset',
};

/** Message key under `ui.postDetailInspector.decisions` for a review decision. */
export function getReviewDecisionKey(
  decision?: ReviewDecision,
): ReviewDecisionKey {
  return REVIEW_DECISION_KEYS[decision ?? ReviewDecision.UNSET];
}

/** Lineage and review state, rendered inside the Lineage inspector section. */
export default function PostSidebarLineage({
  reviewSummary,
  browserTimezone,
}: PostSidebarLineageProps) {
  const translate = useTranslations('ui.postDetailInspector');
  const formatReviewDecision = (decision?: ReviewDecision) =>
    translate(`decisions.${getReviewDecisionKey(decision)}`);
  const reviewEvents = [...(reviewSummary.reviewEvents ?? [])].sort(
    (left, right) => right.reviewedAt.localeCompare(left.reviewedAt),
  );

  return (
    <div className="space-y-4" data-testid="post-lineage">
      <div>
        <h3 className="text-xs font-semibold uppercase text-foreground/60">
          {translate('workflowLineage')}
        </h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">{translate('workflow')}</span>
            <span className="text-right">
              {reviewSummary.sourceWorkflowName ??
                reviewSummary.sourceWorkflowId ??
                translate('notRecorded')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">{translate('action')}</span>
            <span className="text-right">
              {reviewSummary.sourceActionId ?? translate('notRecorded')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">
              {translate('generation')}
            </span>
            <span className="text-right">
              {reviewSummary.generationId ?? translate('notLinked')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">{translate('prompt')}</span>
            <span className="line-clamp-2 text-right">
              {reviewSummary.promptUsed ?? translate('notRecorded')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">{translate('turboRun')}</span>
            <span className="text-right">
              {reviewSummary.reviewTurboRunId ?? translate('notLinked')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">
              {translate('reviewItem')}
            </span>
            <span className="text-right">
              {reviewSummary.reviewItemId ?? translate('notLinked')}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase text-foreground/60">
          {translate('reviewState')}
        </h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">{translate('decision')}</span>
            <span className="text-right">
              {formatReviewDecision(reviewSummary.reviewDecision)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-foreground/60">{translate('reviewed')}</span>
            <span className="text-right">
              {reviewSummary.reviewedAt ? (
                <ClientDateTime
                  value={reviewSummary.reviewedAt}
                  format={(date) =>
                    date.toLocaleString('en-US', {
                      timeZone: browserTimezone,
                    })
                  }
                />
              ) : (
                translate('decisions.unset')
              )}
            </span>
          </div>
        </div>
        {reviewSummary.reviewFeedback && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/75">
            {reviewSummary.reviewFeedback}
          </p>
        )}

        {reviewEvents.length > 0 && (
          <div className="mt-4 divide-y divide-border">
            {reviewEvents.map((event) => (
              <div
                key={`${event.reviewedAt}-${event.decision}`}
                className="py-3 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="font-medium">
                    {formatReviewDecision(event.decision)}
                  </span>
                  <span className="text-right text-foreground/60">
                    <ClientDateTime
                      value={event.reviewedAt}
                      format={(date) =>
                        date.toLocaleString('en-US', {
                          timeZone: browserTimezone,
                        })
                      }
                    />
                  </span>
                </div>
                {event.feedback && (
                  <p className="mt-2 whitespace-pre-wrap text-foreground/75">
                    {event.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
