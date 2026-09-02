import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  applyVideoResolutionCreditMultiplier,
  calculateDynamicVideoCost,
  commitDeferredCredits,
  type DeferredCreditsRequest,
  isDeferredCreditsRequest,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForNonBatchOutputs,
  videoOutputCount,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import {
  hasGenerationSourceActionId,
  reserveGenerationRequestCredits,
} from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import type { ByokProvider } from '@genfeedai/enums';
import {
  buildPricingAuditStamp,
  FABRICATED_VIDEO_EXTENSION_STITCH_CREDITS,
} from '@genfeedai/pricing';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class VideoGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly byokService: ByokService,
  ) {}

  async ensureDeferredCredits(
    createVideoDto: Pick<
      CreateVideoDto,
      'duration' | 'height' | 'outputs' | 'resolution' | 'width'
    >,
    model: string,
    organization: string,
    request: Request,
  ): Promise<void> {
    await this.ensureDeferredCreditsResolved(
      createVideoDto,
      model,
      organization,
      request,
      true,
    );
  }

  private async ensureDeferredCreditsResolved(
    createVideoDto: Pick<
      CreateVideoDto,
      'duration' | 'height' | 'outputs' | 'resolution' | 'width'
    >,
    model: string,
    organization: string,
    request: Request,
    isReservationEnabled: boolean,
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
      !hasGenerationSourceActionId(request) &&
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
      return;
    }
    if (isReservationEnabled) {
      await this.reserveResolvedCredits(requiredCredits, organization, request);
    }
  }

  async ensureExtensionCredits(
    createVideoDto: Pick<
      CreateVideoDto,
      'duration' | 'height' | 'outputs' | 'resolution' | 'width'
    >,
    model: string,
    organization: string,
    request: Request,
    dispatchMode: 'fabricated' | 'native',
  ): Promise<void> {
    await this.ensureDeferredCreditsResolved(
      createVideoDto,
      model,
      organization,
      request,
      false,
    );

    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    const config = reqWithCredits.creditsConfig;
    if (config?.amount === undefined) {
      return;
    }

    if (dispatchMode !== 'fabricated') {
      await this.reserveResolvedCredits(config.amount, organization, request);
      return;
    }

    const requiredCredits =
      config.amount + FABRICATED_VIDEO_EXTENSION_STITCH_CREDITS;
    if (
      !config.isByokBypass &&
      !hasGenerationSourceActionId(request) &&
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

    reqWithCredits.creditsConfig = { ...config, amount: requiredCredits };
    await this.reserveResolvedCredits(requiredCredits, organization, request);
  }

  private async reserveResolvedCredits(
    amount: number,
    organizationId: string,
    request: Request,
  ): Promise<void> {
    try {
      await reserveGenerationRequestCredits({
        amount,
        creditsUtilsService: this.creditsUtilsService,
        organizationId,
        request,
      });
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        const balance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            organizationId,
          );
        throw createInsufficientCreditsException(amount, balance);
      }
      throw error;
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
    createVideoDto: Pick<
      CreateVideoDto,
      'duration' | 'height' | 'outputs' | 'resolution' | 'width'
    >,
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
    const resolutionAdjusted = applyVideoResolutionCreditMultiplier(
      baseCost,
      model,
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
