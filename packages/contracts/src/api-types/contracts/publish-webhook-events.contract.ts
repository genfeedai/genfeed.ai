import { z } from 'zod';
import { ReleaseStatus, TargetExecutionState } from '../..';
import { deriveReleaseStatusFromTargets } from './scheduler.contract';
import {
  classifyWebhookError,
  createWebhookEventId,
  redactWebhookText,
  WEBHOOK_ERROR_CLASSES,
  webhookErrorClassSchema,
  webhookErrorSchema,
  webhookIsoDateTimeSchema,
  webhookNullableStringSchema,
} from './webhook-events.shared';

export const PUBLISH_WEBHOOK_SCHEMA_VERSION = 1;

export const PUBLISH_WEBHOOK_EVENT_TYPES = [
  'release.published',
  'release.partially_published',
  'release.failed',
  'target.published',
  'target.failed',
] as const;

export const PUBLISH_WEBHOOK_ERROR_CLASSES = WEBHOOK_ERROR_CLASSES;

const isoDateTimeSchema = webhookIsoDateTimeSchema;
const nullableStringSchema = webhookNullableStringSchema;

export const publishWebhookEventTypeSchema = z.enum(
  PUBLISH_WEBHOOK_EVENT_TYPES,
);

export const publishWebhookErrorClassSchema = webhookErrorClassSchema;

export const publishWebhookTargetStatusSchema = z.enum([
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.FAILED,
] as const);

export const publishWebhookReleaseStatusSchema = z.enum([
  ReleaseStatus.PUBLISHED,
  ReleaseStatus.PARTIALLY_PUBLISHED,
  ReleaseStatus.FAILED,
] as const);

export const publishWebhookErrorSchema = webhookErrorSchema;

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
  const releaseStatus = deriveReleaseStatusFromTargets(
    targets.map((item) => item.status),
  );

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
  return createWebhookEventId([
    'publish',
    input.event,
    input.releaseId,
    input.targetId ?? 'release',
    input.status,
  ]);
}

export function classifyPublishWebhookError(
  message: string,
): PublishWebhookErrorClass {
  return classifyWebhookError(message);
}

export function redactPublishWebhookText(value: string): string {
  return redactWebhookText(value);
}
