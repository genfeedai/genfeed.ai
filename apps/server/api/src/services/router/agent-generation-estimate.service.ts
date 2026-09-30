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
  MODEL_OUTPUT_CAPABILITIES,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import type {
  AgentGenerationQuote,
  AgentGenerationQuoteInput,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const UNAVAILABLE_QUOTE: AgentGenerationQuote = {
  credits: null,
  isAvailable: false,
  modelKey: null,
};

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
    const isVideo = input.category === ModelCategory.VIDEO;
    const category = isVideo ? ModelCategory.VIDEO : ModelCategory.IMAGE;
    try {
      const modelKey =
        input.modelKey ??
        (
          await this.routerService.selectModel({
            category,
            duration: input.duration,
            organizationId: input.organizationId,
            outputs: input.outputs,
            prioritize: input.prioritize,
            prompt: input.prompt,
          })
        ).modelDetails.key;

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
        return UNAVAILABLE_QUOTE;
      }

      const dimensions =
        input.dimensions ??
        resolveAgentGenerationDimensions(
          input.aspectRatio,
          isVideo
            ? DEFAULT_AGENT_VIDEO_ASPECT_RATIO
            : DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
        );
      const provider = isVideo
        ? model.provider
        : resolveImageGenerationProvider(modelKey, model.provider);
      if (!provider) return UNAVAILABLE_QUOTE;
      const outputs = isVideo
        ? (input.outputs ?? 1)
        : resolveImageBillableOutputs(provider, input.outputs ?? 1);
      const isBatchSupported = isVideo
        ? Boolean(MODEL_OUTPUT_CAPABILITIES[modelKey]?.isBatchSupported)
        : isNativeImageBatch(modelKey, provider);
      const selected = isVideo ? input.resolution : input.quality;
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
          ? { selectors: { [isVideo ? 'resolution' : 'quality']: selected } }
          : {}),
      });
      const credits = quote.credits;

      return Number.isFinite(credits) && credits >= 0
        ? { credits, isAvailable: true, modelKey }
        : UNAVAILABLE_QUOTE;
    } catch (error: unknown) {
      this.logger.warn('Agent generation credit estimate unavailable', {
        category: input.category,
        error: error instanceof Error ? error.message : String(error),
        organizationId: input.organizationId,
      });
      return UNAVAILABLE_QUOTE;
    }
  }
}
