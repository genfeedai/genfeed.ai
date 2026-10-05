import {
  isNativeImageBatch,
  resolveImageBillableOutputs,
  resolveImageGenerationProvider,
} from '@api/collections/images/services/image-generation-provider.util';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  IMAGE_EDIT_QUALITY,
  isFlux3ImageModel,
  isFlux3Resolution,
  MODEL_OUTPUT_CAPABILITIES,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import {
  type AgentGenerationQuote,
  type AgentGenerationQuoteInput,
  AgentGenerationQuoteUnavailableReason,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

function unavailableQuote(
  unavailableReason: AgentGenerationQuoteUnavailableReason,
  modelKey: string | null = null,
): AgentGenerationQuote {
  return { credits: null, isAvailable: false, modelKey, unavailableReason };
}

function isPricingUnresolved(error: unknown): boolean {
  if (!(error instanceof ServiceUnavailableException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'PRICING_UNAVAILABLE'
  );
}

/**
 * #4672 Manual-mode review card estimate, #4813 billing parity. Resolves the
 * concrete, organization-enabled model the Agent's request would actually use
 * (the same `RouterService.selectModel` auto-selection the real generation
 * call makes) and prices it through the very calculator
 * `ImageGenerationCreditsService` / `VideoGenerationCreditsService` reserve
 * with: actual execution dimensions, exact reviewed selectors, request/output
 * quantities and the same frozen tariff admission uses.
 *
 * Invalid output counts reject. An unresolvable model, missing pricing, or
 * any registry error surfaces as `isAvailable: false` so the review card
 * renders as unavailable and prevents generation until a current quote exists.
 * Quoting never debits credits and never contacts a generation provider.
 */
@Injectable()
export class AgentGenerationEstimateService {
  constructor(
    private readonly routerService: RouterService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly logger: LoggerService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
  ) {}

  async estimate(
    input: AgentGenerationQuoteInput,
  ): Promise<AgentGenerationQuote> {
    if (
      input.outputs !== undefined &&
      (!Number.isInteger(input.outputs) ||
        input.outputs < 1 ||
        input.outputs > 8)
    ) {
      throw new BadRequestException(
        'Outputs must be an integer between 1 and 8.',
      );
    }
    const isVideo = input.category === 'video';
    const isEdit = input.category === 'image-edit';
    const category = isVideo
      ? ModelCategory.VIDEO
      : isEdit
        ? ModelCategory.IMAGE_EDIT
        : ModelCategory.IMAGE;
    // Only routing by prompt needs one; an edit default resolves without it.
    if (!input.modelKey && !isEdit && !input.prompt?.trim()) {
      return unavailableQuote(
        AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
      );
    }
    try {
      const modelKey =
        input.modelKey ??
        (isEdit
          ? (
              await this.routerService.resolveModelKey({
                category,
                organizationId: input.organizationId,
              })
            ).key
          : (
              await this.routerService.selectModel({
                category,
                duration: input.duration,
                organizationId: input.organizationId,
                outputs: input.outputs,
                prioritize: input.prioritize,
                prompt: input.prompt ?? '',
              })
            ).modelDetails.key);

      if (modelKey.startsWith('crun/'))
        return unavailableQuote(
          AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
          modelKey,
        );
      const model = await this.modelRegistrationService.validateModelForOrg(
        modelKey,
        input.organizationId,
      );
      if (
        !model ||
        model.key !== modelKey ||
        model.category !== category ||
        !model.isActive ||
        model.isDeleted ||
        (model.organizationId && model.organizationId !== input.organizationId)
      ) {
        return unavailableQuote(
          AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
        );
      }

      const dimensions =
        input.dimensions ??
        (input.width !== undefined && input.height !== undefined
          ? { height: input.height, width: input.width }
          : undefined) ??
        resolveAgentGenerationDimensions(
          input.aspectRatio,
          isVideo
            ? DEFAULT_AGENT_VIDEO_ASPECT_RATIO
            : DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
        );
      const provider = isVideo
        ? model.provider
        : resolveImageGenerationProvider(modelKey, model.provider);
      if (!provider)
        return unavailableQuote(
          AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
        );
      const outputs = isVideo
        ? (input.outputs ?? 1)
        : resolveImageBillableOutputs(provider, input.outputs ?? 1);
      const isBatchSupported = isVideo
        ? Boolean(MODEL_OUTPUT_CAPABILITIES[modelKey]?.isBatchSupported)
        : isNativeImageBatch(modelKey, provider);
      const flux = isFlux3ImageModel(modelKey);
      if (
        flux &&
        (outputs !== 1 ||
          !isFlux3Resolution(input.resolution ?? '1k') ||
          input.quality !== undefined)
      )
        return unavailableQuote(
          AgentGenerationQuoteUnavailableReason.MISSING_SETTING,
        );
      // Admission always edits at the fixed quality tier; only Flux has a resolution.
      const selected = flux
        ? (input.resolution ?? '1k')
        : isVideo
          ? input.resolution
          : isEdit
            ? IMAGE_EDIT_QUALITY
            : input.quality;
      const quote = await this.modelCreditQuote.quoteSnapshotByKey(modelKey, {
        ...dimensions,
        organizationId: input.organizationId,
        provider,
        outputs,
        requests: isBatchSupported ? 1 : outputs,
        ...(isVideo
          ? { duration: input.duration ?? DEFAULT_AGENT_VIDEO_DURATION_SECONDS }
          : {}),
        ...(selected !== undefined
          ? {
              selectors: {
                [isVideo || flux ? 'resolution' : 'quality']: selected,
              },
            }
          : {}),
      });
      const credits = quote.credits;

      return Number.isFinite(credits) && credits >= 0
        ? { credits, isAvailable: true, modelKey }
        : unavailableQuote(
            AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
          );
    } catch (error: unknown) {
      if (isPricingUnresolved(error)) {
        this.logger.warn('Generation credit estimate has no exact tariff', {
          category: input.category,
          error: error instanceof Error ? error.message : String(error),
          organizationId: input.organizationId,
        });
        return unavailableQuote(
          AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
        );
      }
      this.logger.error('Generation credit estimate failed', error, {
        category: input.category,
        organizationId: input.organizationId,
      });
      return unavailableQuote(AgentGenerationQuoteUnavailableReason.ERROR);
    }
  }
}
