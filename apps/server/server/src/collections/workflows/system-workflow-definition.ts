import type { WorkflowExecutionTrigger } from '@genfeedai/enums';
import type { WorkflowDefinitionInput } from '@server/collections/workflows/workflow-version-definition';

export type SystemWorkflowGraphMetadata = {
  canonicalId: string;
  changeSummary?: string;
  description: string;
  label: string;
  schedule?: string;
  version?: number;
};

export type SystemWorkflowGraphDefinition = SystemWorkflowGraphMetadata & {
  definition: WorkflowDefinitionInput;
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
