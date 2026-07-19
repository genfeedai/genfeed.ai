import {
  CRON_JOB_TYPES,
  type CronJobDocument,
  type CronJobLastStatus,
  type CronJobType,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import type {
  CronRunDocument,
  CronRunTrigger,
} from '@api/collections/cron-jobs/schemas/cron-run.schema';
import type {
  CronJob as PrismaCronJob,
  CronRun as PrismaCronRun,
} from '@genfeedai/prisma';

export const LEGACY_CRON_JOB_MIGRATION_STATUS = 'workflow_migrated';

const LEGACY_CRON_JOB_TYPES = new Set<string>(CRON_JOB_TYPES);

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asCronJobType(value: unknown): CronJobType {
  return value === 'agent_strategy_execution' ||
    value === 'newsletter_substack' ||
    value === 'workflow_execution'
    ? value
    : 'workflow_execution';
}

function asCronJobLastStatus(value: unknown): CronJobLastStatus {
  return value === 'failed' || value === 'running' || value === 'success'
    ? value
    : 'never';
}

function asCronRunTrigger(value: unknown): CronRunTrigger | undefined {
  return value === 'manual' || value === 'scheduled' ? value : undefined;
}

function redactWebhookSecrets(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const redacted = { ...payload };

  if (redacted.webhookSecret !== undefined) {
    redacted.webhookSecret = '[REDACTED]';
  }

  if (
    redacted.webhookHeaders !== null &&
    typeof redacted.webhookHeaders === 'object' &&
    !Array.isArray(redacted.webhookHeaders)
  ) {
    const headers = {
      ...(redacted.webhookHeaders as Record<string, string>),
    };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'authorization' ||
        lower.startsWith('x-') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('api-key')
      ) {
        headers[key] = '[REDACTED]';
      }
    }
    redacted.webhookHeaders = headers;
  }

  return redacted;
}

export function buildCronJobConfig(
  data: Partial<{
    consecutiveFailures: number;
    enabled: boolean;
    jobType: CronJobType;
    lastStatus: CronJobLastStatus;
    name: string;
    payload: Record<string, unknown>;
    schedule: string;
    timezone: string;
  }>,
  existingConfig?: unknown,
): Record<string, unknown> {
  const config = asRecord(existingConfig);

  if (data.consecutiveFailures !== undefined) {
    config.consecutiveFailures = data.consecutiveFailures;
  }
  if (data.enabled !== undefined) {
    config.enabled = data.enabled;
  }
  if (data.jobType !== undefined) {
    config.jobType = data.jobType;
  }
  if (data.lastStatus !== undefined) {
    config.lastStatus = data.lastStatus;
  }
  if (data.name !== undefined) {
    config.name = data.name;
  }
  if (data.payload !== undefined) {
    config.payload = data.payload;
  }
  if (data.schedule !== undefined) {
    config.schedule = data.schedule;
  }
  if (data.timezone !== undefined) {
    config.timezone = data.timezone;
  }

  return config;
}

export function isWorkflowMigratedConfig(config: unknown): boolean {
  const migration = asRecord(asRecord(config).migration);
  return migration.status === LEGACY_CRON_JOB_MIGRATION_STATUS;
}

export function isWorkflowMigratedJob(job: CronJobDocument): boolean {
  return isWorkflowMigratedConfig(job.config);
}

export function readCronJobType(value: unknown): CronJobType | undefined {
  return typeof value === 'string' && LEGACY_CRON_JOB_TYPES.has(value)
    ? (value as CronJobType)
    : undefined;
}

export function toCronJobDocument(
  job: PrismaCronJob,
  options: { redactSecrets?: boolean } = { redactSecrets: true },
): CronJobDocument {
  const config = asRecord(job.config);
  const rawPayload = asRecord(config.payload);
  const payload = options.redactSecrets
    ? redactWebhookSecrets(rawPayload)
    : rawPayload;

  return {
    ...job,
    _id: job.mongoId ?? job.id,
    config,
    consecutiveFailures: asNumber(config.consecutiveFailures, 0),
    enabled: asBoolean(config.enabled, job.status === 'ACTIVE'),
    jobType: asCronJobType(config.jobType),
    lastStatus: asCronJobLastStatus(config.lastStatus),
    name: asString(config.name) ?? job.label ?? 'Untitled cron job',
    organization: job.organizationId,
    payload,
    schedule: asString(config.schedule) ?? job.expression ?? '* * * * *',
    timezone: asString(config.timezone) ?? 'UTC',
    user: job.userId,
  };
}

export function toCronRunDocument(run: PrismaCronRun): CronRunDocument {
  const result = asRecord(run.result);

  return {
    ...run,
    _id: run.mongoId ?? run.id,
    artifacts: asRecord(result.artifacts),
    organization: run.organizationId,
    result,
    trigger: asCronRunTrigger(result.trigger),
    user: run.userId,
  };
}
