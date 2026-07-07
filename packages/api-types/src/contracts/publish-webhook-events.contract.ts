import { ReleaseStatus, TargetExecutionState } from '@genfeedai/enums';
import { z } from 'zod';

export const PUBLISH_WEBHOOK_SCHEMA_VERSION = 1;

export const PUBLISH_WEBHOOK_EVENT_TYPES = [
  'release.published',
  'release.partially_published',
  'release.failed',
  'target.published',
  'target.failed',
] as const;

export const PUBLISH_WEBHOOK_ERROR_CLASSES = [
  'misconfiguration',
  'credential',
  'provider_outage',
  'rate_limit',
  'validation',
  'unknown',
] as const;

const isoDateTimeSchema = z.string().datetime({ offset: true });
const nullableStringSchema = z.string().min(1).nullable().optional();

export const publishWebhookEventTypeSchema = z.enum(
  PUBLISH_WEBHOOK_EVENT_TYPES,
);

export const publishWebhookErrorClassSchema = z.enum(
  PUBLISH_WEBHOOK_ERROR_CLASSES,
);

export const publishWebhookTargetStatusSchema = z.enum([
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.FAILED,
] as const);

export const publishWebhookReleaseStatusSchema = z.enum([
  ReleaseStatus.PUBLISHED,
  ReleaseStatus.PARTIALLY_PUBLISHED,
  ReleaseStatus.FAILED,
] as const);

export const publishWebhookErrorSchema = z.object({
  class: publishWebhookErrorClassSchema,
  code: nullableStringSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const publishWebhookTargetSchema = z.object({
  credential: z.object({
    id: z.string().min(1),
  }),
  error: publishWebhookErrorSchema.nullable().optional(),
  externalProviderId: nullableStringSchema,
  externalShortcode: nullableStringSchema,
  id: z.string().min(1),
  platform: z.string().min(1),
  publishedAt: nullableStringSchema,
  scheduledAt: nullableStringSchema,
  status: publishWebhookTargetStatusSchema,
  url: nullableStringSchema,
});

export const publishWebhookReleaseSchema = z.object({
  id: z.string().min(1),
  publishedAt: nullableStringSchema,
  scheduledAt: nullableStringSchema,
  status: publishWebhookReleaseStatusSchema,
  targetSummary: z.object({
    failed: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const publishWebhookPayloadSchema = z
  .object({
    event: publishWebhookEventTypeSchema,
    eventId: z.string().min(1),
    occurredAt: isoDateTimeSchema,
    release: publishWebhookReleaseSchema,
    schemaVersion: z.literal(PUBLISH_WEBHOOK_SCHEMA_VERSION),
    target: publishWebhookTargetSchema.optional(),
    targets: z.array(publishWebhookTargetSchema).min(1).optional(),
    timestamp: isoDateTimeSchema,
  })
  .superRefine((payload, ctx) => {
    if (payload.event.startsWith('target.') && !payload.target) {
      ctx.addIssue({
        code: 'custom',
        message: 'target events require target',
        path: ['target'],
      });
    }

    if (payload.event.startsWith('release.') && !payload.targets) {
      ctx.addIssue({
        code: 'custom',
        message: 'release events require targets',
        path: ['targets'],
      });
    }
  });

export type PublishWebhookEventType = z.infer<
  typeof publishWebhookEventTypeSchema
>;
export type PublishWebhookErrorClass = z.infer<
  typeof publishWebhookErrorClassSchema
>;
export type PublishWebhookTarget = z.infer<typeof publishWebhookTargetSchema>;
export type PublishWebhookRelease = z.infer<typeof publishWebhookReleaseSchema>;
export type PublishWebhookPayload = z.infer<typeof publishWebhookPayloadSchema>;

export function createPublishWebhookEventId(input: {
  event: PublishWebhookEventType;
  releaseId: string;
  status: string;
  targetId?: string | null;
}): string {
  return [
    'publish',
    input.event,
    input.releaseId,
    input.targetId ?? 'release',
    input.status,
  ]
    .map(normalizeEventIdSegment)
    .join(':');
}

export function classifyPublishWebhookError(
  message: string,
): PublishWebhookErrorClass {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('credential') ||
    normalized.includes('oauth') ||
    normalized.includes('token') ||
    normalized.includes('auth') ||
    normalized.includes('reconnect')
  ) {
    return 'credential';
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('quota') ||
    normalized.includes('429')
  ) {
    return 'rate_limit';
  }

  if (
    normalized.includes('validation') ||
    normalized.includes('invalid') ||
    normalized.includes('unsupported')
  ) {
    return 'validation';
  }

  if (
    normalized.includes('configured') ||
    normalized.includes('configuration') ||
    normalized.includes('missing') ||
    normalized.includes('not found')
  ) {
    return 'misconfiguration';
  }

  if (
    normalized.includes('provider') ||
    normalized.includes('timeout') ||
    normalized.includes('unavailable') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504')
  ) {
    return 'provider_outage';
  }

  return 'unknown';
}

export function redactPublishWebhookText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|webhook[_-]?secret|password|secret)(\s*[:=]\s*)([^\s,;]+)/gi,
      '$1$2[REDACTED]',
    );
}

function normalizeEventIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
