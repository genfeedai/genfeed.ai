import { ModelsService } from '@api/collections/models/services/models.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory, type RouterPriority } from '@genfeedai/contracts';
import {
  quoteImageGenerationQualityCredits,
  quoteVideoGenerationCredits,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface AgentGenerationCreditEstimateInput {
  category: ModelCategory.IMAGE | ModelCategory.VIDEO;
  duration?: number;
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
  /** Resolved even when pricing lookup failed, so the review card can still
   * name the model it would use. */
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
 * Never throws: an unresolvable model, a model missing pricing fields, or
 * any registry error surfaces as `isAvailable: false` so the review card
 * still renders with "estimate unavailable" and waits for confirmation
 * (Manual mode never auto-runs on a failed estimate).
 */
@Injectable()
export class AgentGenerationEstimateService {
  constructor(
    private readonly routerService: RouterService,
    private readonly modelsService: ModelsService,
    private readonly logger: LoggerService,
  ) {}

  async estimate(
    input: AgentGenerationCreditEstimateInput,
  ): Promise<AgentGenerationCreditEstimate> {
    let modelKey: string | null = null;
    try {
      const recommendation = await this.routerService.selectModel({
        category: input.category,
        duration: input.duration,
        organizationId: input.organizationId,
        outputs: input.outputs,
        prioritize: input.prioritize,
        prompt: input.prompt,
      });
      modelKey = recommendation.modelDetails.key;

      const model = await this.findEnabledModel(modelKey, input.organizationId);
      if (!model) {
        return { credits: null, isAvailable: false, modelKey };
      }

      const outputs = Math.max(1, input.outputs ?? 1);
      const credits =
        input.category === ModelCategory.VIDEO
          ? quoteVideoGenerationCredits({
              cost: recommendation.modelDetails.cost,
              costPerUnit: model.costPerUnit,
              duration: input.duration,
              minCost: model.minCost,
              modelKey,
              outputs,
              pricingType: model.pricingType,
              resolution: input.resolution,
            })
          : quoteImageGenerationQualityCredits(
              recommendation.modelDetails.cost,
              modelKey,
              input.quality,
            ) * outputs;

      return { credits, isAvailable: true, modelKey };
    } catch (error: unknown) {
      this.logger.warn('Agent generation credit estimate unavailable', {
        category: input.category,
        error: error instanceof Error ? error.message : String(error),
        organizationId: input.organizationId,
      });
      return { credits: null, isAvailable: false, modelKey };
    }
  }

  /** Org-private row first, then the global catalog row — mirrors the
   * registry's own visibility precedence without depending on
   * `RouterService`'s private helpers (owned by lane G). */
  private async findEnabledModel(key: string, organizationId: string) {
    return (
      (await this.modelsService.findOne({ key, organizationId })) ??
      (await this.modelsService.findOne({ key, organizationId: null }))
    );
  }
}
