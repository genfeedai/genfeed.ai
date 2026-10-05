import type { TaskEventInput } from '@api/collections/tasks/services/task-actions.service';
import type { WorkspaceTaskQualityAssessmentResult } from '@api/services/task-orchestration/workspace-task-quality.service';

export interface TaskRollupOutcome {
  event: TaskEventInput;
  patch: Record<string, unknown>;
}

const EXECUTION_FAILURE_REASON = 'One or more workflow executions failed.';

export function buildRollupFailureOutcome(
  resultPreview: string,
): TaskRollupOutcome {
  return {
    event: {
      payload: {
        failureReason: EXECUTION_FAILURE_REASON,
        resultPreview: resultPreview || undefined,
      },
      type: 'task_failed',
    },
    patch: {
      failureReason: EXECUTION_FAILURE_REASON,
      progress: {
        activeRunCount: 0,
        message: 'One or more executions failed.',
        percent: 100,
        stage: 'failed',
      },
      resultPreview: resultPreview || undefined,
      reviewState: 'none',
      reviewTriggered: true,
      status: 'failed',
    },
  };
}

export function buildRollupReviewOutcome(
  qualityAssessment: WorkspaceTaskQualityAssessmentResult,
  resultPreview: string,
  completedAt: Date,
): TaskRollupOutcome {
  return {
    event: {
      payload: {
        gate: qualityAssessment.gate,
        resultPreview: resultPreview || undefined,
        score: qualityAssessment.score,
      },
      type: 'task_ready_for_review',
    },
    patch: {
      completedAt,
      progress: {
        activeRunCount: 0,
        message: 'Generation finished. Awaiting review.',
        percent: 100,
        stage: 'review',
      },
      qualityAssessment,
      requestedChangesReason:
        qualityAssessment.gate === 'pass'
          ? null
          : buildQualityReviewReason(qualityAssessment),
      resultPreview: resultPreview || undefined,
      reviewState: 'pending_approval',
      reviewTriggered: true,
      status: 'in_review',
    },
  };
}

function buildQualityReviewReason(
  qualityAssessment: WorkspaceTaskQualityAssessmentResult,
): string {
  const fixes = qualityAssessment.suggestedFixes.slice(0, 3).join(' ');
  const summary =
    qualityAssessment.summary ??
    'The system quality gate flagged this output for revision.';
  return [summary, fixes].filter(Boolean).join(' ');
}
