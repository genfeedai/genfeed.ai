import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  calculateDynamicImageCost,
  commitDeferredCredits,
  type DeferredCreditsRequest,
  doesImageProviderFanOutPerOutput,
  isDeferredCreditsRequest,
  requestedOutputCount,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForFanOut,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import {
  hasGenerationSourceActionId,
  reserveGenerationRequestCredits,
} from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import type { ByokProvider } from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import { buildPricingAuditStamp } from '@genfeedai/pricing';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class ImageGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
    private readonly byokService: ByokService,
  ) {}

  async ensureDeferredCredits(
    createImageDto: CreateImageDto,
    model: string,
    organization: string,
    request: Request,
  ): Promise<void> {
    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return;
    }

    const { requiredCredits, resolvedModelDoc } =
      await this.resolveRequiredCredits(createImageDto, model);
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

    try {
      await reserveGenerationRequestCredits({
        amount: requiredCredits,
        creditsUtilsService: this.creditsUtilsService,
        organizationId: organization,
        request,
      });
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        const balance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            organization,
          );
        throw createInsufficientCreditsException(requiredCredits, balance);
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
    createImageDto: CreateImageDto,
    model: string,
  ) {
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

    const requiredCredits = scaleCreditsForFanOut(
      baseCost,
      requestedOutputCount(createImageDto.outputs),
      doesImageProviderFanOutPerOutput(
        this.providerRegistry.providerFor(model) ?? undefined,
        isBatchSupported,
      ),
    );

    return { requiredCredits, resolvedModelDoc };
  }
}
