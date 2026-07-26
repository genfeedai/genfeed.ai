import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { PricingType } from '@genfeedai/enums';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

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
        deferred?: boolean;
        amount?: number;
        modelKey?: string;
      };
    };
    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    const resolvedModelDoc = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(model),
    });
    let requiredCredits = resolvedModelDoc
      ? this.calculateDynamicImageCost(
          resolvedModelDoc,
          createImageDto.width || 1920,
          createImageDto.height || 1080,
        )
      : 5;

    const requestedOutputs = Number(createImageDto.outputs) || 1;
    const provider = this.providerRegistry.providerFor(model);
    const isBatchSupported =
      MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false;
    const fansOutPerOutput =
      provider === 'fal' || (provider === 'replicate' && !isBatchSupported);
    if (requestedOutputs > 1 && fansOutPerOutput) {
      requiredCredits *= requestedOutputs;
    }

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
      throw new HttpException(
        {
          detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
          title: 'Insufficient credits',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount: requiredCredits,
      deferred: false,
      modelKey: model,
    };
  }

  private calculateDynamicImageCost(
    model: {
      cost?: number;
      pricingType?: PricingType;
      costPerUnit?: number;
      minCost?: number;
    },
    width: number,
    height: number,
  ): number {
    const pricingType = model.pricingType || PricingType.FLAT;
    let baseCost = model.cost || 0;

    if (
      pricingType === PricingType.PER_MEGAPIXEL &&
      width &&
      height &&
      model.costPerUnit
    ) {
      baseCost = Math.ceil(((width * height) / 1_000_000) * model.costPerUnit);
    }

    const minCost = model.minCost || 0;
    return minCost > 0 && baseCost < minCost ? minCost : baseCost;
  }
}
