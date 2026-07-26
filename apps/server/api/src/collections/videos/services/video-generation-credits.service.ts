import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { PricingType } from '@genfeedai/enums';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

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
      ? this.calculateDynamicVideoCost(
          resolvedModelDoc,
          createVideoDto.width || 1920,
          createVideoDto.height || 1080,
          createVideoDto.duration || 0,
        )
      : 5;

    if (
      createVideoDto.resolution === 'high' ||
      createVideoDto.resolution === '1080p'
    ) {
      requiredCredits *= 2;
    }
    const requestedOutputs = createVideoDto.outputs || 1;
    const isBatchSupported =
      MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false;
    if (!isBatchSupported && requestedOutputs > 1) {
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

  private calculateDynamicVideoCost(
    model: {
      cost?: number;
      pricingType?: PricingType;
      costPerUnit?: number;
      minCost?: number;
    },
    width: number,
    height: number,
    duration: number,
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
    } else if (
      pricingType === PricingType.PER_SECOND &&
      duration &&
      model.costPerUnit
    ) {
      baseCost = Math.ceil(duration * model.costPerUnit);
    }

    const minCost = model.minCost || 0;
    return minCost > 0 && baseCost < minCost ? minCost : baseCost;
  }
}
