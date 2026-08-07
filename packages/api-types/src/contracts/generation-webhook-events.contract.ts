import { z } from 'zod';
import {
  classifyWebhookError,
  createWebhookEventId,
  redactWebhookText,
  type WebhookErrorClass,
  webhookErrorSchema,
  webhookIsoDateTimeSchema,
  webhookNullableStringSchema,
} from './webhook-events.shared';

export const GENERATION_WEBHOOK_SCHEMA_VERSION = 1;

export const GENERATION_WEBHOOK_EVENT_TYPES = [
  'generation.completed',
  'generation.failed',
] as const;

/**
 * Media families that emit generation webhooks today. `image` and `video`
 * resolve to an ingredient id; `article` resolves to an article id.
 */
export const GENERATION_WEBHOOK_KINDS = ['image', 'video', 'article'] as const;

export const GENERATION_WEBHOOK_STATUSES = ['completed', 'failed'] as const;

export const generationWebhookEventTypeSchema = z.enum(
  GENERATION_WEBHOOK_EVENT_TYPES,
);

export const generationWebhookKindSchema = z.enum(GENERATION_WEBHOOK_KINDS);

export const generationWebhookStatusSchema = z.enum(
  GENERATION_WEBHOOK_STATUSES,
);

export const generationWebhookOutputSchema = z.object({
  mimeType: webhookNullableStringSchema,
  storageKey: webhookNullableStringSchema,
  url: webhookNullableStringSchema,
});

export const generationWebhookSchema = z.object({
  brandId: webhookNullableStringSchema,
  completedAt: webhookNullableStringSchema,
  error: webhookErrorSchema.nullable().optional(),
  id: z.string().min(1),
  kind: generationWebhookKindSchema,
  model: webhookNullableStringSchema,
  output: generationWebhookOutputSchema.nullable().optional(),
  provider: webhookNullableStringSchema,
  status: generationWebhookStatusSchema,
});

export const generationWebhookPayloadSchema = z
  .object({
    event: generationWebhookEventTypeSchema,
    eventId: z.string().min(1),
    generation: generationWebhookSchema,
    occurredAt: webhookIsoDateTimeSchema,
    schemaVersion: z.literal(GENERATION_WEBHOOK_SCHEMA_VERSION),
    timestamp: webhookIsoDateTimeSchema,
  })
  .superRefine((payload, ctx) => {
    if (payload.event === 'generation.failed' && !payload.generation.error) {
      ctx.addIssue({
        code: 'custom',
        message: 'generation.failed requires generation.error',
        path: ['generation', 'error'],
      });
    }

    const expectedStatus =
      payload.event === 'generation.failed' ? 'failed' : 'completed';
    if (payload.generation.status !== expectedStatus) {
      ctx.addIssue({
        code: 'custom',
        message: `${payload.event} requires generation.status "${expectedStatus}"`,
        path: ['generation', 'status'],
      });
    }
  });

export type GenerationWebhookEventType = z.infer<
  typeof generationWebhookEventTypeSchema
>;
export type GenerationWebhookKind = z.infer<typeof generationWebhookKindSchema>;
export type GenerationWebhookStatus = z.infer<
  typeof generationWebhookStatusSchema
>;
export type GenerationWebhookOutput = z.infer<
  typeof generationWebhookOutputSchema
>;
export type GenerationWebhookGeneration = z.infer<
  typeof generationWebhookSchema
>;
export type GenerationWebhookPayload = z.infer<
  typeof generationWebhookPayloadSchema
>;

export function createGenerationWebhookEventId(input: {
  event: GenerationWebhookEventType;
  generationId: string;
  kind: GenerationWebhookKind;
  status: GenerationWebhookStatus;
}): string {
  return createWebhookEventId([
    'generation',
    input.event,
    input.kind,
    input.generationId,
    input.status,
  ]);
}

export function classifyGenerationWebhookError(
  message: string,
): WebhookErrorClass {
  return classifyWebhookError(message);
}

export function redactGenerationWebhookText(value: string): string {
  return redactWebhookText(value);
}

export function createSampleGenerationWebhookPayload(
  input: {
    event?: GenerationWebhookEventType;
    generationId?: string;
    kind?: GenerationWebhookKind;
    occurredAt?: Date | string;
  } = {},
): GenerationWebhookPayload {
  const event = input.event ?? 'generation.completed';
  const kind = input.kind ?? 'image';
  const generationId = input.generationId ?? 'ingredient_sample';
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : (input.occurredAt ?? '2026-01-01T00:00:00.000Z');
  const isFailureEvent = event === 'generation.failed';
  const status: GenerationWebhookStatus = isFailureEvent
    ? 'failed'
    : 'completed';

  return generationWebhookPayloadSchema.parse({
    event,
    eventId: createGenerationWebhookEventId({
      event,
      generationId,
      kind,
      status,
    }),
    generation: {
      brandId: 'brand_sample',
      completedAt: occurredAt,
      error: isFailureEvent
        ? {
            class: 'provider_outage',
            code: 'sample_provider_error',
            message: 'Sample provider timeout',
            retryable: true,
          }
        : null,
      id: generationId,
      kind,
      model: 'sample-model',
      output: isFailureEvent
        ? null
        : {
            mimeType: kind === 'article' ? 'text/markdown' : 'image/png',
            storageKey: `generations/${generationId}`,
            url: `https://example.com/generations/${generationId}`,
          },
      provider: 'sample-provider',
      status,
    },
    occurredAt,
    schemaVersion: GENERATION_WEBHOOK_SCHEMA_VERSION,
    timestamp: occurredAt,
  });
}
