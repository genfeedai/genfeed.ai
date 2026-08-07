/**
 * Prisma-backed agent_runs.status labels. Identical to Postgres
 * `AgentRunStatus` SCREAMING_SNAKE members (no domain-only extras).
 *
 * Prefer this type when writing the agent_runs column. Use AgentRunStatus
 * only when strategy history needs BUDGET_EXHAUSTED as well.
 */
export enum AgentExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum AgentExecutionTrigger {
  MANUAL = 'manual',
  CRON = 'cron',
  EVENT = 'event',
  WEBHOOK = 'webhook',
  SUBAGENT = 'subagent',
}
