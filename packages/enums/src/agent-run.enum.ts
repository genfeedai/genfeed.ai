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
