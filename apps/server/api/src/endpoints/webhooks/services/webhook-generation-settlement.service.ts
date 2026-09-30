import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Terminal media billing failures are recoverable and must preserve durable outputs. */
@Injectable()
export class WebhookGenerationSettlementService {
  constructor(
    private readonly generationBilling: GenerationBillingService,
    private readonly mediaGenerationCostService: MediaGenerationCostService,
    private readonly loggerService: LoggerService,
  ) {}

  async settleOutput(
    ingredientId: string,
    organizationId: string | null | undefined,
  ): Promise<void> {
    if (!organizationId) return;
    try {
      await this.generationBilling.settleOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        `WebhookGenerationSettlementService generation credit settlement failed`,
        error,
        { ingredientId, organizationId },
      );
    }
  }

  async releaseOutput(
    ingredientId: string,
    organizationId: string | null | undefined,
  ): Promise<void> {
    if (!organizationId) return;
    try {
      await this.generationBilling.releaseOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        `WebhookGenerationSettlementService generation credit release failed`,
        error,
        { ingredientId, organizationId },
      );
    }
  }

  recordGenerationCost(
    input: Parameters<MediaGenerationCostService['recordGenerationCost']>[0],
  ): ReturnType<MediaGenerationCostService['recordGenerationCost']> {
    return this.mediaGenerationCostService.recordGenerationCost(input);
  }
}
