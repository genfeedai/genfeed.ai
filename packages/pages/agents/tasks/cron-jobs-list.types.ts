import type {
  CronJobRecord,
  CronJobType,
} from '@services/automation/cron-jobs.service';
import type { CronJobFormState } from './CronJobForm';

export interface CronJob {
  id: string;
  name: string;
  jobType: CronJobType;
  schedule: string;
  timezone: string;
  payload: Record<string, unknown>;
  lastRun: {
    status: 'success' | 'failed' | 'running' | 'never';
    at: string | null;
  };
  nextRun: string | null;
  paused: boolean;
  failures: number;
  maxRetries: number;
  retryBackoffMinutes: number;
}

export const defaultNewsletterPayload = {
  instructions:
    'Focus on Genfeed.ai product updates and actionable creator workflows.',
  model: 'openai/gpt-4o-mini',
  publicationName: 'Genfeed.ai',
  sources: ['https://genfeed.ai', 'https://genfeed.ai/workflows'],
  topic: 'Genfeed.ai weekly update',
  webhookHeaders: {
    'X-Target': 'substack-bridge',
  },
  webhookUrl: '',
};

export const defaultFormState: CronJobFormState = {
  jobType: 'newsletter_substack',
  maxRetries: '0',
  name: 'Genfeed Newsletter (Substack Draft)',
  payloadText: JSON.stringify(defaultNewsletterPayload, null, 2),
  retryBackoffMinutes: '5',
  schedule: '0 9 * * 1',
  timezone: 'UTC',
  webhookHeadersText: JSON.stringify(
    defaultNewsletterPayload.webhookHeaders,
    null,
    2,
  ),
  webhookSecret: '',
  webhookUrl: '',
};

export const statusColorMap: Record<string, string> = {
  failed: 'error',
  never: 'default',
  running: 'warning',
  success: 'success',
};

export function toCronJob(record: CronJobRecord): CronJob {
  return {
    failures: record.consecutiveFailures,
    id: record.id,
    jobType: record.jobType,
    lastRun: {
      at: record.lastRunAt ?? null,
      status: record.lastStatus,
    },
    maxRetries: record.maxRetries ?? 0,
    name: record.name,
    nextRun: record.nextRunAt ?? null,
    paused: !record.enabled,
    payload: record.payload ?? {},
    retryBackoffMinutes: record.retryBackoffMinutes ?? 5,
    schedule: record.schedule,
    timezone: record.timezone,
  };
}

export function validateWebhookUrl(url: string): string | null {
  if (!url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const isHttp = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    if (!isHttp) {
      return 'Webhook URL must start with http:// or https://';
    }

    const blockedHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (blockedHosts.has(parsed.hostname)) {
      return 'Webhook URL cannot use localhost or loopback hosts';
    }

    return null;
  } catch {
    return 'Webhook URL is invalid';
  }
}

export function parseWebhookHeaders(
  headersText: string,
): Record<string, string> {
  const parsed = JSON.parse(headersText || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Webhook headers must be a JSON object');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const invalid = entries.find(([, value]) => typeof value !== 'string');
  if (invalid) {
    throw new Error('Webhook headers values must be strings');
  }

  return Object.fromEntries(entries) as Record<string, string>;
}
