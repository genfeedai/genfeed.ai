import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory, type RouterPriority } from '@genfeedai/contracts';
import {
  quoteImageGenerationQualityCredits,
  quoteVideoGenerationCredits,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface AgentGenerationCreditEstimateInput {
  category: ModelCategory.IMAGE | ModelCategory.VIDEO;
  duration?: number;
  modelKey?: string;
  organizationId: string;
  outputs?: number;
  prioritize?: RouterPriority;
  prompt: string;
  /** Image quality tier (`standard` | `hd`) — ignored for video. */
  quality?: string;
  resolution?: string;
}

export interface AgentGenerationCreditEstimate {
  /** `null` when the estimate could not be computed. */
  credits: number | null;
  isAvailable: boolean;
  /** Concrete validated model; unavailable quotes never disclose a key. */
  modelKey: string | null;
}

/**
 * #4672 Manual-mode review card estimate. Resolves the concrete,
 * organization-enabled model the Agent's request would actually use — the
 * same `RouterService.selectModel` auto-selection the real generation call
 * makes (issue audit: "returns base cost without org scoping or
 * multipliers" — this service adds both) — and prices it with the
 * duration/resolution/output multipliers `#4672` requires.
 *
 * Invalid output counts reject. An unresolvable model, missing pricing, or
 * any registry error surfaces as `isAvailable: false` so the review card
 * renders as unavailable and prevents generation until a current quote exists.
 */
@Injectable()
export class AgentGenerationEstimateService {
  constructor(
    private readonly routerService: RouterService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly logger: LoggerService,
  ) {}

  async estimate(
    input: AgentGenerationCreditEstimateInput,
  ): Promise<AgentGenerationCreditEstimate> {
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
    try {
      const modelKey =
        input.modelKey ??
        (
          await this.routerService.selectModel({
            category: input.category,
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
        model.category !== input.category ||
        !model.isActive ||
        model.isDeleted ||
        (model.organizationId &&
          model.organizationId !== input.organizationId) ||
        typeof baseCost !== 'number' ||
        !Number.isFinite(baseCost) ||
        baseCost < 0
      ) {
        return { credits: null, isAvailable: false, modelKey: null };
      }

      const outputs = Math.max(1, input.outputs ?? 1);
      const credits =
        input.category === ModelCategory.VIDEO
          ? quoteVideoGenerationCredits({
              cost: baseCost,
              costPerUnit: model.costPerUnit,
              duration: input.duration,
              minCost: model.minCost,
              modelKey,
              outputs,
              pricingType: model.pricingType,
              resolution: input.resolution,
            })
          : quoteImageGenerationQualityCredits(
              baseCost,
              modelKey,
              input.quality,
            ) * outputs;

      return Number.isFinite(credits) && credits >= 0
        ? { credits, isAvailable: true, modelKey }
        : { credits: null, isAvailable: false, modelKey: null };
    } catch (error: unknown) {
      this.logger.warn('Agent generation credit estimate unavailable', {
        category: input.category,
        error: error instanceof Error ? error.message : String(error),
        organizationId: input.organizationId,
      });
      return { credits: null, isAvailable: false, modelKey: null };
    }
  }
}
