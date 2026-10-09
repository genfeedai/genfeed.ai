import type { WorkflowGraphDefinitionInput } from '@api/collections/workflows/workflow-version-definition';
import type { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import type { OrganizationModuleId } from '@genfeedai/contracts/constants';

/**
 * `RunSystemWorkflowInput.source` value used by every platform-cron sweep
 * dispatch (`PlatformWorkflowSchedulesService`: proactive-agent-strategies,
 * analytics-sync, content-loop-autopilot). `SystemWorkflowRunnerService`
 * checks this to route the enqueue onto `PLATFORM_SYSTEM_WORKFLOW_QUEUE`
 * instead of the shared interactive queue — see #5162.
 */
export const PLATFORM_WORKFLOW_SCHEDULE_SOURCE =
  'PlatformWorkflowSchedulesService';

/**
 * `RunSystemWorkflowInput.source` value used only by
 * `AgentAutopilotWorkflowService.executeStrategy`'s own dispatch of the
 * `agent.turn.execute` workflow (up to `MAX_STRATEGIES_PER_CYCLE` per org,
 * per platform sweep tick). Not set by any interactive path —
 * `AgentTurnAcceptanceService.accept` always sets a distinct top-level
 * `source`. `SystemWorkflowRunnerService` checks this the same way as
 * `PLATFORM_WORKFLOW_SCHEDULE_SOURCE` so a burst of proactive turns can't
 * compete with a live user's turn either — see #5162 (#5252 review).
 */
export const PROACTIVE_AGENT_TURN_SOURCE = 'proactive';

export type SystemWorkflowGraphMetadata = {
  canonicalId: string;
  changeSummary?: string;
  description: string;
  label: string;
  /** Code-owned product admission; never read from editable mirror metadata. */
  organizationModule?: OrganizationModuleId;
  /** Terminal state projection after an admitted side effect; never new work. */
  moduleCompletionNodeIds?: readonly string[];
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
