import { Alert } from '@ui/primitives/alert';
import type { ReactElement } from 'react';

type SupervisedReviewStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

interface ClipperWorkflowStatusFooterProps {
  generatedVideoIds: string[];
  workflowExecutionId: string | null;
  finalVideoUrl: string | undefined;
  draftReviewUrl: string | null;
  supervisedReviewStatus: SupervisedReviewStatus;
  workflowExecutionUrl: string;
  humanReviewUrl: string;
}

export function ClipperWorkflowStatusFooter({
  generatedVideoIds,
  workflowExecutionId,
  finalVideoUrl,
  draftReviewUrl,
  supervisedReviewStatus,
  workflowExecutionUrl,
  humanReviewUrl,
}: ClipperWorkflowStatusFooterProps): ReactElement {
  return (
    <>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Generated clips: {generatedVideoIds.length}</p>
        {workflowExecutionId && (
          <a
            className="block text-primary underline-offset-2 hover:underline"
            href={workflowExecutionUrl}
          >
            View workflow execution →
          </a>
        )}
        {finalVideoUrl && (
          <a
            className="block text-primary underline-offset-2 hover:underline"
            href={finalVideoUrl}
          >
            Open final asset →
          </a>
        )}
        {draftReviewUrl && (
          <a
            className="block text-primary underline-offset-2 hover:underline"
            href={draftReviewUrl}
          >
            Open draft handoff →
          </a>
        )}
        <a
          className="block text-primary underline-offset-2 hover:underline"
          href={humanReviewUrl}
        >
          Open human review queue →
        </a>
      </div>

      {supervisedReviewStatus === 'completed' && (
        <Alert size="sm" variant="success">
          Handed off into the supervised publishing flow for human review.
        </Alert>
      )}
    </>
  );
}
