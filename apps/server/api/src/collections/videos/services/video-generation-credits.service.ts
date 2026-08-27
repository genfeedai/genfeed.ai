import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import { baseModelKey } from '@server/collections/models/utils/model-key.util';
import { CreateVideoDto } from '@server/collections/videos/dto/create-video.dto';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  applyHighResolutionVideoMultiplier,
  calculateDynamicVideoCost,
  commitDeferredCredits,
  type DeferredCreditsRequest,
  isDeferredCreditsRequest,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForNonBatchOutputs,
  videoOutputCount,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { ByokService } from '@server/services/byok/byok.service';
import { resolveModelByokProvider } from '@server/services/byok/byok-provider-map.util';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import type { ByokProvider } from '@genfeedai/enums';
import { buildPricingAuditStamp } from '@genfeedai/pricing';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class VideoGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly byokService: ByokService,
  ) {}

  async ensureDeferredCredits(
    createVideoDto: CreateVideoDto,
    model: string,
    organization: string,
    request: Request,
  ): Promise<void> {
    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return;
    }

    const { requiredCredits, resolvedModelDoc } =
      await this.resolveRequiredCredits(createVideoDto, model);
    const byokProvider = await this.resolveActiveByokProvider(
      organization,
      model,
      resolvedModelDoc?.provider,
    );
    if (
      !byokProvider &&
      !(await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organization,
        requiredCredits,
      ))
    ) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organization,
        );
      throw createInsufficientCreditsException(requiredCredits, balance);
    }
    commitDeferredCredits(
      reqWithCredits,
      requiredCredits,
      model,
      resolvedModelDoc ? buildPricingAuditStamp(resolvedModelDoc) : undefined,
    );
    if (byokProvider) {
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        isByokBypass: true,
        provider: byokProvider,
      };
    }
  }

  private async resolveActiveByokProvider(
    organizationId: string,
    modelKey: string,
    modelProvider?: string,
  ): Promise<ByokProvider | undefined> {
    const provider = resolveModelByokProvider(modelKey, modelProvider);
    if (
      !provider ||
      !(await this.byokService.isByokActiveForProvider(
        organizationId,
        provider,
      ))
    ) {
      return undefined;
    }
    if (!(await this.byokService.isByokBillingInGoodStanding(organizationId))) {
      throw new HttpException(
        {
          detail:
            'BYOK access is suspended due to an unpaid platform fee invoice. Please update your payment method or purchase a credit pack.',
          title: 'BYOK billing past due',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return provider;
  }

  private async resolveRequiredCredits(
    createVideoDto: CreateVideoDto,
    model: string,
  ) {
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

    const requiredCredits = scaleCreditsForNonBatchOutputs(
      resolutionAdjusted,
      videoOutputCount(createVideoDto.outputs),
      isBatchSupported,
    );

    return { requiredCredits, resolvedModelDoc };
  }
}
