'use client';

import type { PostReviewSummary } from '@genfeedai/props/components/post-detail-sidebar.props';
import Card from '@ui/card/Card';
import ClientDateTime from '@ui/components/time/ClientDateTime';

const formatReviewDecision = (
  decision?: 'approved' | 'rejected' | 'request_changes',
) => {
  if (decision === 'request_changes') {
    return 'Changes requested';
  }

  if (decision) {
    return decision.charAt(0).toUpperCase() + decision.slice(1);
  }

  return 'Not reviewed';
};

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
            <div className="mt-4 space-y-3">
              {reviewEvents.map((event) => (
                <div
                  key={`${event.reviewedAt}-${event.decision}`}
                  className="rounded-lg border border-border bg-background/40 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-medium">
                      {formatReviewDecision(event.decision)}
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
