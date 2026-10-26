import { ServerFunnelCaptureService } from '@api/services/analytics/server-funnel-capture.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientStatus } from '@genfeedai/contracts';
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
} from '@genfeedai/contracts/api-types/contracts/generation-webhook-events.contract';
import {
  FIRST_SUCCESSFUL_GENERATION_EVENT,
  GENERATION_COMPLETED_EVENT,
} from '@genfeedai/contracts/constants';
import { readNonBlankStringOrNull } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
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
    @Optional()
    private readonly prisma?: PrismaService,
    @Optional()
    private readonly funnelCaptureService?: ServerFunnelCaptureService,
  ) {}

  async emitGenerationCompleted(
    input: GenerationWebhookOutcomeInput,
  ): Promise<void> {
    await this.emitGenerationOutcome(input, 'completed');
    this.captureGenerationCompletedBestEffort(input);
  }

  /**
   * Best-effort PostHog capture for `generation_completed` and, on an
   * organization's first output, `first_successful_generation`. Added at this
   * terminal point because every image and video generation path already
   * calls it, so one hook covers all providers. `generationId` is the
   * ingredient id; its owning user is the PostHog distinct id, matching the
   * client `identify` and the other server funnel events. Skips the capture,
   * never invents an identity, when the ingredient has no owning user. Never
   * throws.
   */
  private captureGenerationCompletedBestEffort(
    input: GenerationWebhookOutcomeInput,
  ): void {
    const { funnelCaptureService, prisma } = this;
    const { generationId, kind, organizationId } = input;
    if (!(funnelCaptureService && prisma && generationId && organizationId)) {
      return;
    }

    void (async () => {
      const ingredient = await prisma.ingredient.findFirst({
        select: { userId: true },
        where: scopedWhere(organizationId, { id: generationId }),
      });
      if (!ingredient?.userId) {
        return;
      }

      const properties = {
        $groups: { organization: organizationId },
        generationType: kind,
      };
      await funnelCaptureService.capture({
        distinctId: ingredient.userId,
        event: GENERATION_COMPLETED_EVENT,
        organizationId,
        properties: { ...properties, outcome: 'success' },
      });

      const priorGenerationCount = await prisma.ingredient.count({
        where: scopedWhere(organizationId, {
          id: { not: generationId },
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        }),
      });
      if (priorGenerationCount > 0) {
        return;
      }
      await funnelCaptureService.capture({
        distinctId: ingredient.userId,
        event: FIRST_SUCCESSFUL_GENERATION_EVENT,
        organizationId,
        properties,
      });
    })().catch((error: unknown) => {
      this.logger.warn(
        `${this.constructorName} generation funnel capture skipped`,
        {
          error: error instanceof Error ? error.message : error,
          generationId,
          organizationId,
        },
      );
    });
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
  const mimeType = readNonBlankStringOrNull(input.output?.mimeType);
  const storageKey = readNonBlankStringOrNull(input.output?.storageKey);
  const url = readNonBlankStringOrNull(input.output?.url);

  if (!mimeType && !storageKey && !url) {
    return null;
  }

  return { mimeType, storageKey, url };
}
