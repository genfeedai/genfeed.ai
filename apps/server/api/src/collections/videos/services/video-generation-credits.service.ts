import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { SeedanceReferenceQuoteEvidence } from '@api/collections/videos/services/seedance-reference-evidence.util';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { assertApprovedGenerationQuote } from '@api/helpers/utils/credits/approved-generation-quote.util';
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
import { buildVideoQuoteSelectors } from '@api/helpers/utils/credits/video-quote-selectors.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { ActivitySource, type ByokProvider } from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import {
  buildPricingAuditStamp,
  FABRICATED_VIDEO_EXTENSION_STITCH_CREDITS,
} from '@genfeedai/pricing';
import { estimateClipChainCredits } from '@genfeedai/workflows/engine';
import { Injectable } from '@nestjs/common';

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
    private readonly modelCreditQuote: ModelCreditQuoteService,
  ) {}

  async ensureDeferredCredits(
    createVideoDto: Pick<
      CreateVideoDto,
      | 'duration'
      | 'height'
      | 'outputs'
      | 'resolution'
      | 'width'
      | 'isAudioEnabled'
    >,
    model: string,
    organization: string,
    request: Request,
    providerInput?: Record<string, unknown>,
    referenceEvidence?: SeedanceReferenceQuoteEvidence,
  ): Promise<void> {
    await this.ensureDeferredCreditsResolved(
      createVideoDto,
      model,
      organization,
      request,
      true,
      providerInput,
      referenceEvidence,
    );
  }

  private async ensureDeferredCreditsResolved(
    createVideoDto: Pick<
      CreateVideoDto,
      | 'duration'
      | 'height'
      | 'outputs'
      | 'resolution'
      | 'width'
      | 'isAudioEnabled'
    >,
    model: string,
    organization: string,
    request: Request,
    isReservationEnabled: boolean,
    providerInput?: Record<string, unknown>,
    referenceEvidence?: SeedanceReferenceQuoteEvidence,
  ): Promise<void> {
    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return;
    }

    const { requiredCredits, resolvedModelDoc, modelQuote } =
      await this.resolveRequiredCredits(
        createVideoDto,
        model,
        organization,
        providerInput,
        referenceEvidence,
      );
    const byok = await this.resolveActiveByokKey(
      organization,
      model,
      resolvedModelDoc?.provider,
    );
    assertApprovedGenerationQuote(
      reqWithCredits.creditsConfig?.approvedGenerationQuote,
      modelQuote,
      Boolean(byok),
    );
    if (
      !byok &&
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
    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      modelQuote,
    };
    if (byok) {
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        byokApiKeyOverride: byok.apiKey,
        ...(byok.apiSecret ? { byokApiSecretOverride: byok.apiSecret } : {}),
        isByokBypass: true,
        provider: byok.provider,
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
      | 'duration'
      | 'height'
      | 'outputs'
      | 'resolution'
      | 'width'
      | 'isAudioEnabled'
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
      key: model,
    });
    const byok = await this.resolveActiveByokKey(
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
    if (byok) {
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        byokApiKeyOverride: byok.apiKey,
        ...(byok.apiSecret ? { byokApiSecretOverride: byok.apiSecret } : {}),
        isByokBypass: true,
        provider: byok.provider,
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

  /**
   * The single BYOK decision point for video generation (#5294). Resolves
   * the org's decrypted key exactly once — the returned key is both the
   * bypass decision (defined/undefined) and the value dispatch must use, so
   * the credit charge and the provider call can never disagree about whose
   * key paid.
   */
  private async resolveActiveByokKey(
    organizationId: string,
    modelKey: string,
    modelProvider?: string,
  ): Promise<
    { provider: ByokProvider; apiKey: string; apiSecret?: string } | undefined
  > {
    const provider = resolveModelByokProvider(modelKey, modelProvider);
    if (!provider) {
      return undefined;
    }
    const resolved = await this.byokService.resolveApiKey(
      organizationId,
      provider,
    );
    if (!resolved) {
      return undefined;
    }
    return { provider, ...resolved };
  }

  private async resolveRequiredCredits(
    createVideoDto: Pick<
      CreateVideoDto,
      | 'duration'
      | 'height'
      | 'outputs'
      | 'resolution'
      | 'width'
      | 'isAudioEnabled'
    >,
    model: string,
    organizationId: string,
    providerInput?: Record<string, unknown>,
    referenceEvidence?: SeedanceReferenceQuoteEvidence,
  ) {
    const resolvedModelDoc = await this.modelsService.findOne({ key: model });
    const outputs = createVideoDto.outputs ?? 1;
    const modelQuote = await this.modelCreditQuote.quoteSnapshotByKey(model, {
      organizationId,
      provider: resolvedModelDoc?.provider,
      providerInput,
      ...referenceEvidence,
      duration: createVideoDto.duration,
      height: createVideoDto.height,
      width: createVideoDto.width,
      outputs,
      requests: MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported
        ? 1
        : outputs,
      selectors: buildVideoQuoteSelectors(createVideoDto),
    });
    return {
      requiredCredits: modelQuote.credits,
      resolvedModelDoc,
      modelQuote,
    };
  }
}
