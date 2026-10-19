import { CircleCheck } from 'lucide-react';
import type { ReactElement } from 'react';

type SupervisedReviewStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

interface ClipWorkflowStatusFooterProps {
  generatedVideoIds: string[];
  workflowExecutionId: string | null;
  finalVideoUrl: string | undefined;
  draftReviewUrl: string | null;
  supervisedReviewStatus: SupervisedReviewStatus;
  workflowExecutionUrl: string;
  humanReviewUrl: string;
}

export function ClipWorkflowStatusFooter({
  generatedVideoIds,
  workflowExecutionId,
  finalVideoUrl,
  draftReviewUrl,
  supervisedReviewStatus,
  workflowExecutionUrl,
  humanReviewUrl,
}: ClipWorkflowStatusFooterProps): ReactElement {
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
        <div className="flex items-center gap-2 border border-success/20 bg-success/10 px-3 py-2 text-xs text-success   ">
          <CircleCheck className="size-4" />
          Handed off into the supervised publishing flow for human review.
        </div>
      )}
    </>
  );
}
