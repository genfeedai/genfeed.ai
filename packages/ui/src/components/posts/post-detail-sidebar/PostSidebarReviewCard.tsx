'use client';

import { ReviewDecision } from '@genfeedai/enums';
import type {
  PostReviewEventDecision,
  PostReviewSummary,
} from '@genfeedai/props/components/post-detail-sidebar.props';
import Card from '@ui/card/Card';
import ClientDateTime from '@ui/components/time/ClientDateTime';

/** `posts.reviewDecision` — Prisma enum column. */
const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  [ReviewDecision.APPROVED]: 'Approved',
  [ReviewDecision.REJECTED]: 'Rejected',
  [ReviewDecision.REQUEST_CHANGES]: 'Changes requested',
};

/** `posts.reviewEvents[].decision` — `Json` column, lowercase vocabulary. */
const REVIEW_EVENT_DECISION_LABELS: Record<PostReviewEventDecision, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  request_changes: 'Changes requested',
};

const formatReviewDecision = (decision?: ReviewDecision) =>
  decision ? REVIEW_DECISION_LABELS[decision] : 'Not reviewed';

const formatReviewEventDecision = (decision: PostReviewEventDecision) =>
  REVIEW_EVENT_DECISION_LABELS[decision];

type PostSidebarReviewCardProps = {
  reviewSummary: PostReviewSummary;
  browserTimezone: string;
};

export default function PostSidebarReviewCard({
  reviewSummary,
  browserTimezone,
}: PostSidebarReviewCardProps) {
  const reviewEvents = (reviewSummary.reviewEvents ?? []).toSorted(
    (left, right) => right.reviewedAt.localeCompare(left.reviewedAt),
  );

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-lg">Lineage</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Workflow</span>
              <span className="text-right">
                {reviewSummary.sourceWorkflowName ??
                  reviewSummary.sourceWorkflowId ??
                  'Not recorded'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Action</span>
              <span className="text-right">
                {reviewSummary.sourceActionId ?? 'Not recorded'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Generation</span>
              <span className="text-right">
                {reviewSummary.generationId ?? 'Not linked'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Prompt</span>
              <span className="line-clamp-2 text-right">
                {reviewSummary.promptUsed ?? 'Not recorded'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Review batch</span>
              <span className="text-right">
                {reviewSummary.reviewBatchId ?? 'Not linked'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Review item</span>
              <span className="text-right">
                {reviewSummary.reviewItemId ?? 'Not linked'}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="font-semibold text-lg">Review State</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Decision</span>
              <span className="text-right">
                {formatReviewDecision(reviewSummary.reviewDecision)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-foreground/60">Reviewed</span>
              <span className="text-right">
                {reviewSummary.reviewedAt ? (
                  <ClientDateTime
                    value={reviewSummary.reviewedAt}
                    format={(date) =>
                      date.toLocaleString(undefined, {
                        timeZone: browserTimezone,
                      })
                    }
                  />
                ) : (
                  'Not reviewed'
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
                      {formatReviewEventDecision(event.decision)}
                    </span>
                    <span className="text-right text-foreground/60">
                      <ClientDateTime
                        value={event.reviewedAt}
                        format={(date) =>
                          date.toLocaleString(undefined, {
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
    </Card>
  );
}
