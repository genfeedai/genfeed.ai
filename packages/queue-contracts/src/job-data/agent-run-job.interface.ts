import type { ActionOriginContext } from '@genfeedai/enums';

export interface AgentRunJobData {
  /** Trusted initiating action context propagated across queue retries */
  actionContext?: ActionOriginContext;
  /** The agent-runs record ID */
  runId: string;
  /** Organization context (required for multi-tenancy) */
  organizationId: string;
  /** User who triggered the run */
  userId: string;
  /** Strategy ID if cron-triggered */
  strategyId?: string;
  /** Agent type — drives tool subset and prompt template */
  agentType?: string;
  /** Preferred model override for this strategy */
  model?: string;
  /** Autonomy mode — supervised or auto-publish */
  autonomyMode?: string;
  /** Task/prompt for the agent */
  objective?: string;
  /** Credit budget cap */
  creditBudget?: number;
  /** Campaign ID — links the run to an agent campaign for coordination */
  campaignId?: string;
}
