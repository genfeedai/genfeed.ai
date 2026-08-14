import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  calculateDynamicImageCost,
  commitDeferredCredits,
  doesImageProviderFanOutPerOutput,
  isDeferredCreditsRequest,
  requestedOutputCount,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForFanOut,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ImageGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
  ) {}

  async ensureDeferredCredits(
    createImageDto: CreateImageDto,
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
      createImageDto,
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
    createImageDto: CreateImageDto,
    model: string,
  ): Promise<number> {
    const resolvedModelDoc = await this.modelsService.findOne({
      key: baseModelKey(model),
    });
    const { height, width } = resolveGenerationDimensions(
      createImageDto.width,
      createImageDto.height,
    );
    const baseCost = resolveModelCreditCost(resolvedModelDoc, (modelDoc) =>
      calculateDynamicImageCost(modelDoc, width, height),
    );
    const isBatchSupported =
      MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false;

    return scaleCreditsForFanOut(
      baseCost,
      requestedOutputCount(createImageDto.outputs),
      doesImageProviderFanOutPerOutput(
        this.providerRegistry.providerFor(model),
        isBatchSupported,
      ),
    );
  }
}
