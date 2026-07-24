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

export function createSamplePublishWebhookPayload(
  input: {
    event?: PublishWebhookEventType;
    occurredAt?: Date | string;
    releaseId?: string;
    targetId?: string;
  } = {},
): PublishWebhookPayload {
  const event = input.event ?? 'target.published';
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : (input.occurredAt ?? '2026-01-01T00:00:00.000Z');
  const releaseId = input.releaseId ?? 'release_sample';
  const targetId = input.targetId ?? 'target_sample';
  const isFailureEvent = event.endsWith('.failed');
  const targetStatus = isFailureEvent
    ? TargetExecutionState.FAILED
    : TargetExecutionState.PUBLISHED;
  const releaseStatus =
    event === 'release.partially_published'
      ? ReleaseStatus.PARTIALLY_PUBLISHED
      : isFailureEvent
        ? ReleaseStatus.FAILED
        : ReleaseStatus.PUBLISHED;
  const publishedTarget = {
    credential: { id: 'credential_sample' },
    error: null,
    externalProviderId: 'post_sample_123',
    externalShortcode: 'sample123',
    id: targetId,
    platform: 'youtube',
    publishedAt: occurredAt,
    scheduledAt: occurredAt,
    status: TargetExecutionState.PUBLISHED,
    url: 'https://example.com/p/sample123',
  } satisfies PublishWebhookTarget;
  const failedTarget = {
    credential: { id: 'credential_sample' },
    error: {
      class: 'validation',
      code: 'sample_validation_error',
      message: 'Sample publish validation failed',
      retryable: false,
    },
    externalProviderId: null,
    externalShortcode: null,
    id: targetId,
    platform: 'youtube',
    publishedAt: null,
    scheduledAt: occurredAt,
    status: TargetExecutionState.FAILED,
    url: null,
  } satisfies PublishWebhookTarget;
  const target =
    targetStatus === TargetExecutionState.FAILED
      ? failedTarget
      : publishedTarget;
  const targets =
    event === 'release.partially_published'
      ? [
          publishedTarget,
          {
            ...failedTarget,
            id: `${targetId}_failed`,
            platform: 'tiktok',
          },
        ]
      : [target];

  return publishWebhookPayloadSchema.parse({
    event,
    eventId: createPublishWebhookEventId({
      event,
      releaseId,
      status: event.startsWith('release.') ? releaseStatus : targetStatus,
      targetId: event.startsWith('target.') ? targetId : null,
    }),
    occurredAt,
    release: {
      id: releaseId,
      publishedAt:
        releaseStatus === ReleaseStatus.PUBLISHED ? occurredAt : null,
      scheduledAt: occurredAt,
      status: releaseStatus,
      targetSummary: {
        failed: targets.filter(
          (item) => item.status === TargetExecutionState.FAILED,
        ).length,
        published: targets.filter(
          (item) => item.status === TargetExecutionState.PUBLISHED,
        ).length,
        total: targets.length,
      },
    },
    schemaVersion: PUBLISH_WEBHOOK_SCHEMA_VERSION,
    ...(event.startsWith('target.') ? { target } : { targets }),
    timestamp: occurredAt,
  });
}

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
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(
      /(["']?)(access[_-]?token|refresh[_-]?token|oauth[_-]?token|session[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|webhook[_-]?secret|password|signature|secret|token)\1(\s*[:=]\s*)(["'])([^"']*)\4/gi,
      '$1$2$1$3$4[REDACTED]$4',
    )
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|oauth[_-]?token|session[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|webhook[_-]?secret|password|signature|secret|token)(\s*[:=]\s*)([^\s,;"'}\]]+)/gi,
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
