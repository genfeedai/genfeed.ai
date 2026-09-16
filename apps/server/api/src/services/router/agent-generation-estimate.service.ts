import { resolveImageGenerationProvider } from '@api/collections/images/services/image-generation-provider.util';
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
import {
  calculateImageGenerationCredits,
  calculateVideoGenerationCredits,
} from '@genfeedai/pricing';
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
 * with: effective execution dimensions from the aspect ratio, per-megapixel
 * and minimum-cost rules, quality/resolution/duration multipliers, and the
 * provider fan-out or native-batch output semantics.
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
      const baseCost = model?.cost;
      if (
        !model ||
        model.key !== modelKey ||
        model.category !== category ||
        !model.isActive ||
        model.isDeleted ||
        (model.organizationId &&
          model.organizationId !== input.organizationId) ||
        typeof baseCost !== 'number' ||
        !Number.isFinite(baseCost) ||
        baseCost < 0
      ) {
        return UNAVAILABLE_QUOTE;
      }

      const dimensions = resolveAgentGenerationDimensions(
        input.aspectRatio,
        isVideo
          ? DEFAULT_AGENT_VIDEO_ASPECT_RATIO
          : DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
      );
      const pricing = {
        cost: baseCost,
        costPerUnit: model.costPerUnit,
        minCost: model.minCost,
        pricingType: model.pricingType,
      };
      const isBatchSupported =
        MODEL_OUTPUT_CAPABILITIES[modelKey]?.isBatchSupported ?? false;
      const { credits } = isVideo
        ? calculateVideoGenerationCredits({
            ...dimensions,
            duration: input.duration || DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
            isBatchSupported,
            modelKey,
            outputs: input.outputs,
            pricing,
            resolution: input.resolution,
          })
        : calculateImageGenerationCredits({
            ...dimensions,
            imageProvider: resolveImageGenerationProvider(modelKey),
            isBatchSupported,
            modelKey,
            outputs: input.outputs,
            pricing,
            quality: input.quality,
          });

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
