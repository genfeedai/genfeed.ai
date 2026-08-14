import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  applyHighResolutionVideoMultiplier,
  calculateDynamicVideoCost,
  commitDeferredCredits,
  isDeferredCreditsRequest,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForNonBatchOutputs,
  videoOutputCount,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  async ensureDeferredCredits(
    createVideoDto: CreateVideoDto,
    model: string,
    organization: string,
    request: Request,
  ): Promise<void> {
    const reqWithCredits = request as unknown as {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        modelKey?: string;
      };
    };
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return;
    }

    const requiredCredits = await this.resolveRequiredCredits(
      createVideoDto,
      model,
    );
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organization,
        requiredCredits,
      );
    if (!hasCredits) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organization,
        );
      throw createInsufficientCreditsException(requiredCredits, balance);
    }
    commitDeferredCredits(reqWithCredits, requiredCredits, model);
  }

  private async resolveRequiredCredits(
    createVideoDto: CreateVideoDto,
    model: string,
  ): Promise<number> {
    const resolvedModelDoc = await this.modelsService.findOne({
      key: baseModelKey(model),
    });
    const { height, width } = resolveGenerationDimensions(
      createVideoDto.width,
      createVideoDto.height,
    );
    const baseCost = resolveModelCreditCost(resolvedModelDoc, (modelDoc) =>
      calculateDynamicVideoCost(
        modelDoc,
        width,
        height,
        createVideoDto.duration || 0,
      ),
    );
    const resolutionAdjusted = applyHighResolutionVideoMultiplier(
      baseCost,
      createVideoDto.resolution,
    );
    const isBatchSupported =
      MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false;

    return scaleCreditsForNonBatchOutputs(
      resolutionAdjusted,
      videoOutputCount(createVideoDto.outputs),
      isBatchSupported,
    );
  }
}
