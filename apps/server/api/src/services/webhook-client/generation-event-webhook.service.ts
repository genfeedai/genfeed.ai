import {
  classifyGenerationWebhookError,
  createGenerationWebhookEventId,
  GENERATION_WEBHOOK_SCHEMA_VERSION,
  type GenerationWebhookKind,
  type GenerationWebhookOutput,
  type GenerationWebhookPayload,
  type GenerationWebhookStatus,
  generationWebhookPayloadSchema,
  redactGenerationWebhookText,
} from '@api-types/contracts/generation-webhook-events.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import {
  GENERATION_WEBHOOK_JOB_ID_PREFIX,
  WebhookDispatchService,
} from './webhook-dispatch.service';

export interface GenerationWebhookOutcomeInput {
  brandId?: string | null;
  generationId: string;
  kind: GenerationWebhookKind;
  model?: string | null;
  occurredAt?: Date;
  organizationId: string;
  output?: Partial<GenerationWebhookOutput> | null;
  provider?: string | null;
}

export interface GenerationWebhookFailureInput
  extends GenerationWebhookOutcomeInput {
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
}

/**
 * Emits `generation.completed` / `generation.failed` from the terminal points of
 * the image, video, and article generation paths. Emission is best-effort: a
 * webhook problem never fails the generation that produced it.
 */
@Injectable()
export class GenerationEventWebhookService {
  private readonly constructorName = 'GenerationEventWebhookService';

  constructor(
    private readonly logger: LoggerService,
    private readonly webhookDispatchService: WebhookDispatchService,
  ) {}

  async emitGenerationCompleted(
    input: GenerationWebhookOutcomeInput,
  ): Promise<void> {
    await this.emitGenerationOutcome(input, 'completed');
  }

  async emitGenerationFailed(
    input: GenerationWebhookFailureInput,
  ): Promise<void> {
    await this.emitGenerationOutcome(input, 'failed');
  }

  private async emitGenerationOutcome(
    input: GenerationWebhookFailureInput,
    status: GenerationWebhookStatus,
  ): Promise<void> {
    try {
      if (!input.organizationId || !input.generationId) {
        this.logger.warn(`${this.constructorName} skipped generation webhook`, {
          hasGenerationId: Boolean(input.generationId),
          hasOrganizationId: Boolean(input.organizationId),
          kind: input.kind,
        });
        return;
      }

      const occurredAtIso = (input.occurredAt ?? new Date()).toISOString();
      const event =
        status === 'failed' ? 'generation.failed' : 'generation.completed';
      const payload: GenerationWebhookPayload =
        generationWebhookPayloadSchema.parse({
          event,
          eventId: createGenerationWebhookEventId({
            event,
            generationId: input.generationId,
            kind: input.kind,
            status,
          }),
          generation: {
            brandId: input.brandId ?? null,
            completedAt: occurredAtIso,
            error: status === 'failed' ? buildGenerationError(input) : null,
            id: input.generationId,
            kind: input.kind,
            model: input.model ?? null,
            output: status === 'failed' ? null : buildGenerationOutput(input),
            provider: input.provider ?? null,
            status,
          },
          occurredAt: occurredAtIso,
          schemaVersion: GENERATION_WEBHOOK_SCHEMA_VERSION,
          timestamp: occurredAtIso,
        });

      await this.webhookDispatchService.dispatch(
        input.organizationId,
        payload,
        {
          jobIdPrefix: GENERATION_WEBHOOK_JOB_ID_PREFIX,
          logLabel: `${this.constructorName} generation`,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to emit generation event`,
        {
          error: redactGenerationWebhookText(
            (error as Error)?.message || 'Generation webhook emission failed',
          ),
          generationId: input.generationId,
          kind: input.kind,
        },
      );
    }
  }
}

function buildGenerationError(input: GenerationWebhookFailureInput) {
  const message = redactGenerationWebhookText(
    input.errorMessage || 'Generation failed',
  );
  const errorClass = classifyGenerationWebhookError(message);

  return {
    class: errorClass,
    code: input.errorCode
      ? redactGenerationWebhookText(input.errorCode)
      : errorClass,
    message,
    retryable: input.retryable ?? false,
  };
}

function buildGenerationOutput(
  input: GenerationWebhookOutcomeInput,
): GenerationWebhookOutput | null {
  const mimeType = readString(input.output?.mimeType);
  const storageKey = readString(input.output?.storageKey);
  const url = readString(input.output?.url);

  if (!mimeType && !storageKey && !url) {
    return null;
  }

  return { mimeType, storageKey, url };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
