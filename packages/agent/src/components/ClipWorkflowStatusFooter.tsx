import type { ReactElement } from 'react';
import { HiCheckCircle } from 'react-icons/hi2';

type SupervisedReviewStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

interface ClipWorkflowStatusFooterProps {
  generatedVideoIds: string[];
  workflowExecutionId: string | null;
  finalVideoId: string | undefined;
  draftReviewUrl: string | null;
  supervisedReviewStatus: SupervisedReviewStatus;
  workflowExecutionUrl: string;
  humanReviewUrl: string;
}

export function ClipWorkflowStatusFooter({
  generatedVideoIds,
  workflowExecutionId,
  finalVideoId,
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
        {finalVideoId && (
          <a
            className="block text-primary underline-offset-2 hover:underline"
            href={`/g/video/${finalVideoId}`}
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
        <div className="flex items-center gap-2 border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          <HiCheckCircle className="size-4" />
          Handed off into the supervised publishing flow for human review.
        </div>
      )}
    </>
  );
}
