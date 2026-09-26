import type { WorkflowGraphDefinitionInput } from '@api/collections/workflows/workflow-version-definition';
import type { WorkflowExecutionTrigger } from '@genfeedai/contracts';

/**
 * `RunSystemWorkflowInput.source` value used by every platform-cron sweep
 * dispatch (`PlatformWorkflowSchedulesService`: proactive-agent-strategies,
 * analytics-sync, content-loop-autopilot). `SystemWorkflowRunnerService`
 * checks this to route the enqueue onto `PLATFORM_SYSTEM_WORKFLOW_QUEUE`
 * with `WORKFLOW_JOB_PRIORITY.PLATFORM_SWEEP` instead of the shared
 * interactive queue — see #5162.
 */
export const PLATFORM_WORKFLOW_SCHEDULE_SOURCE =
  'PlatformWorkflowSchedulesService';

export type SystemWorkflowGraphMetadata = {
  canonicalId: string;
  changeSummary?: string;
  description: string;
  label: string;
  schedule?: string;
  version?: number;
};

export type SystemWorkflowGraphDefinition = SystemWorkflowGraphMetadata & {
  definition: WorkflowGraphDefinitionInput;
  resultNodeId: string;
};

export type RunSystemWorkflowInput = {
  actionType: string;
  canonicalId: string;
  idempotencyKey?: string;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId: string;
  postIds?: string[];
  source: string;
  trigger?: WorkflowExecutionTrigger;
  userId?: string;
  runtimeContext?: unknown;
};
