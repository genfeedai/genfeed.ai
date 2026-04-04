export enum RunActionType {
  GENERATE = 'generate',
  POST = 'post',
  ANALYTICS = 'analytics',
  COMPOSITE = 'composite',
}

export enum RunEventType {
  CREATED = 'run.created',
  STARTED = 'run.started',
  PROGRESS = 'run.progress',
  OUTPUT_READY = 'run.output.ready',
  ANALYTICS_SNAPSHOT = 'run.analytics.snapshot',
  UPDATED = 'run.updated',
  COMPLETED = 'run.completed',
  FAILED = 'run.failed',
  CANCELLED = 'run.cancelled',
}

export enum RunMeteringStage {
  CREATED = 'created',
  EXECUTED = 'executed',
  UPDATED = 'updated',
  CANCELLED = 'cancelled',
}

export enum RunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum RunSurface {
  WEB = 'web',
  TG = 'tg',
  CLI = 'cli',
  EXTENSION = 'extension',
  IDE = 'ide',
  API = 'api',
}

export enum RunAuthType {
  CLERK = 'clerk',
  API_KEY = 'api_key',
}

export enum RunTrigger {
  MANUAL = 'manual',
  API = 'api',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  AGENT = 'agent',
}
