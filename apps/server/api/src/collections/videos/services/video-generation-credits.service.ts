import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  commitDeferredCredits,
  type DeferredCreditsRequest,
  isDeferredCreditsRequest,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import {
  hasGenerationSourceActionId,
  reserveGenerationRequestCredits,
} from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { ActivitySource, type ByokProvider } from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import {
  buildPricingAuditStamp,
  calculateVideoGenerationCredits,
  FABRICATED_VIDEO_EXTENSION_STITCH_CREDITS,
} from '@genfeedai/pricing';
import { estimateClipChainCredits } from '@genfeedai/workflows/engine';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type ClipChainReservationHold = {
  reservationId: string;
  reservedCredits: number;
};

export function readClipChainReservationHold(
  metadata: unknown,
): ClipChainReservationHold | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const credits = (metadata as Record<string, unknown>).credits;
  if (!credits || typeof credits !== 'object' || Array.isArray(credits)) {
    return undefined;
  }
  const hold = credits as Record<string, unknown>;
  const reservationId =
    typeof hold.reservationId === 'string' ? hold.reservationId.trim() : '';
  const reservedCredits =
    typeof hold.reservedCredits === 'number'
      ? hold.reservedCredits
      : Number.NaN;
  if (
    !reservationId ||
    !Number.isFinite(reservedCredits) ||
    reservedCredits < 0
  ) {
    return undefined;
  }
  return { reservationId, reservedCredits };
}

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

  /**
   * Quote the catalog N-segment + stitch cost and hold it before a clip-chain
   * workflow exists. Amount stays `deferred` so the HTTP interceptor does not
   * settle on create — execution settles the hold against completed nodes.
   */
  async ensureClipChainCredits(
    segmentCount: number,
    model: string,
    organization: string,
    request: Request,
  ): Promise<void> {
    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return;
    }

    const requiredCredits = estimateClipChainCredits(segmentCount);
    const resolvedModelDoc = await this.modelsService.findOne({
      key: baseModelKey(model),
    });
    const byokProvider = await this.resolveActiveByokProvider(
      organization,
      model,
      resolvedModelDoc?.provider,
    );
    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount: requiredCredits,
      deferred: true,
      modelKey: model,
    };
    if (byokProvider) {
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        isByokBypass: true,
        provider: byokProvider,
      };
      return;
    }
    if (
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
    await this.reserveResolvedCredits(requiredCredits, organization, request);
  }

  /**
   * Settle completed clip-chain work against the pre-run hold. Nodes do not
   * deduct separately — `actualCredits` is the engine's completed-node total.
   */
  async settleClipChainReservation(params: {
    actualCredits: number;
    actorUserId: string;
    organizationId: string;
    reservationId: string;
    reservedCredits: number;
  }): Promise<void> {
    const actualCredits = Number.isFinite(params.actualCredits)
      ? Math.max(0, params.actualCredits)
      : 0;
    const reservedCredits = Number.isFinite(params.reservedCredits)
      ? Math.max(0, params.reservedCredits)
      : 0;
    const settledCredits = Math.min(actualCredits, reservedCredits);
    if (settledCredits <= 0) {
      await this.creditsUtilsService.releaseReservation({
        organizationId: params.organizationId,
        reservationId: params.reservationId,
      });
      return;
    }
    await this.creditsUtilsService.settleReservation({
      actualAmount: settledCredits,
      actorUserId: params.actorUserId,
      description: 'Clip-chain video reservation settlement',
      organizationId: params.organizationId,
      reservationId: params.reservationId,
      source: ActivitySource.VIDEO_GENERATION,
    });
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
    // #4813 Same calculator the Agent quote uses; only the inputs differ.
    const { credits: requiredCredits } = calculateVideoGenerationCredits({
      duration: createVideoDto.duration,
      height: createVideoDto.height,
      isBatchSupported:
        MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false,
      modelKey: model,
      outputs: createVideoDto.outputs,
      pricing: resolvedModelDoc,
      resolution: createVideoDto.resolution,
      width: createVideoDto.width,
    });

    return { requiredCredits, resolvedModelDoc };
  }
}
