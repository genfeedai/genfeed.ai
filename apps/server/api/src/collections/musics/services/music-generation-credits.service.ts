import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  applyMinCost,
  calculatePerSecondCost,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import { ActivitySource, PricingType } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MusicGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
    private readonly modelsService: ModelsService,
  ) {}

  async settle(
    user: User,
    model: string,
    outputs: number,
    generationId: string,
    duration?: number,
  ): Promise<void> {
    const modelData = await this.modelsService.findOne({ key: model });
    let credits = this.resolveBaseCost(modelData, duration);
    if (credits > 0 && outputs > 1) {
      credits *= outputs;
    }
    if (credits <= 0) {
      return;
    }
    await this.creditsUtilsService.deductCreditsFromOrganization(
      user.organizationId,
      user.userId ?? user.id,
      credits,
      `Music generation - ${model}${outputs > 1 ? ` (${outputs} outputs)` : ''}`,
      ActivitySource.MUSIC_GENERATION,
    );
    this.loggerService.log('Credits deducted after music generation', {
      credits,
      generationId,
      model,
      organizationId: user.organizationId,
      outputs,
      userId: user.userId ?? user.id,
    });
  }

  /**
   * PER_SECOND-priced models (e.g. Eleven Music) bill by the requested
   * duration via `costPerUnit`/`minCost` instead of the flat `cost` column —
   * otherwise a 90s track and a 10s track cost the same.
   */
  private resolveBaseCost(
    modelData: ModelDocument | null,
    duration?: number,
  ): number {
    if (!modelData) {
      return 0;
    }
    if (
      modelData.pricingType === PricingType.PER_SECOND &&
      duration &&
      modelData.costPerUnit
    ) {
      const perSecondCost = calculatePerSecondCost(
        duration,
        modelData.costPerUnit,
      );
      return applyMinCost(perSecondCost, modelData.minCost || 0);
    }
    return modelData.cost || 0;
  }
}
