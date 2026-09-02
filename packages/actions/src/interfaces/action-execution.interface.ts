export type ActionExecutionOrigin =
  | 'agent'
  | 'api'
  | 'mcp'
  | 'scheduler'
  | 'system'
  | 'website'
  | 'worker'
  | 'workflow';

export interface ActionExecutionContext {
  actionId: string;
  brandId?: string;
  idempotencyKey?: string;
  nodeId: string;
  organizationId: string;
  origin: ActionExecutionOrigin;
  runId: string;
  userId: string;
  workflowId: string;
  workflowVersionId: string;
}

export interface ActionExecutionRequest {
  context: ActionExecutionContext;
  input: Record<string, unknown>;
}

export interface ActionExecutionResult {
  data: unknown;
  creditsUsed?: number;
  metadata?: Record<string, unknown>;
}

export type ActionExecutor = (
  request: ActionExecutionRequest,
) => Promise<ActionExecutionResult>;

export const GENFEED_ACTION_NODE_TYPE = 'genfeedAction' as const;
