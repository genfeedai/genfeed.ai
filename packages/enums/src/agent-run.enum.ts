export enum AgentExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum AgentExecutionTrigger {
  MANUAL = 'manual',
  CRON = 'cron',
  EVENT = 'event',
  WEBHOOK = 'webhook',
  SUBAGENT = 'subagent',
}
