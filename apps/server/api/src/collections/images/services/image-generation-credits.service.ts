import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import {
  isNativeImageBatch,
  resolveImageBillableOutputs,
} from '@api/collections/images/services/image-generation-provider.util';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelsService } from '@api/collections/models/services/models.service';
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
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import type { ByokProvider } from '@genfeedai/contracts';
import { ModelCategory } from '@genfeedai/contracts';
import {
  isFlux3ImageModel,
  isImageEditModel,
} from '@genfeedai/contracts/constants';
import type { ModelBillableQuoteSnapshot } from '@genfeedai/contracts/interfaces';
import { buildPricingAuditStamp } from '@genfeedai/pricing';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class ImageGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
    private readonly byokService: ByokService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
  ) {}

  async quoteCredits(
    dto: CreateImageDto,
    model: string,
    organizationId: string,
  ) {
    const { requiredCredits, resolvedModelDoc, modelQuote } =
      await this.resolveRequiredCredits(dto, model, organizationId);
    if (
      !resolvedModelDoc ||
      resolvedModelDoc.key !== model ||
      !resolvedModelDoc.isActive ||
      resolvedModelDoc.isDeleted ||
      resolvedModelDoc.category !==
        (isImageEditModel(model)
          ? ModelCategory.IMAGE_EDIT
          : ModelCategory.IMAGE) ||
      !this.providerRegistry.supports(model, resolvedModelDoc.provider)
    ) {
      throw new ConflictException(
        'The selected image model is unavailable for an exact quote.',
      );
    }
    const byok = await this.resolveActiveByokKey(
      organizationId,
      model,
      resolvedModelDoc.provider,
    );
    return {
      unitCredits: requiredCredits,
      billingMode: byok ? ('byok' as const) : ('credits' as const),
      provider: byok?.provider ?? resolvedModelDoc.provider,
      pricingHash: this.quoteHash(modelQuote),
    };
  }

  async assertApprovedQuote(
    dto: CreateImageDto,
    model: string,
    organizationId: string,
    request: Request,
  ): Promise<void> {
    const approved = (request as unknown as DeferredCreditsRequest)
      .creditsConfig?.approvedImageQuote;
    if (!approved) return;
    if (approved.model !== model)
      throw new ConflictException(
        'The approved image model changed. Request a fresh quote.',
      );
    const actual = await this.quoteCredits(dto, model, organizationId);
    if (
      actual.unitCredits !== approved.unitCredits ||
      actual.billingMode !== approved.billingMode ||
      actual.pricingHash !== approved.pricingHash
    ) {
      throw new ConflictException(
        'Image pricing or billing mode changed. Request a fresh quote.',
      );
    }
  }

  async ensureDeferredCredits(
    createImageDto: CreateImageDto,
    model: string,
    organization: string,
    request: Request,
    providerInput?: Record<string, unknown>,
  ): Promise<void> {
    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return;
    }

    if (
      reqWithCredits.creditsConfig?.approvedImageQuote?.model !== undefined &&
      reqWithCredits.creditsConfig.approvedImageQuote.model !== model
    )
      throw new ConflictException(
        'The approved image model changed. Request a fresh quote.',
      );
    const { requiredCredits, resolvedModelDoc, modelQuote } =
      await this.resolveRequiredCredits(
        createImageDto,
        model,
        organization,
        providerInput,
      );
    const byok = await this.resolveActiveByokKey(
      organization,
      model,
      resolvedModelDoc?.provider,
    );
    const approved = reqWithCredits.creditsConfig?.approvedImageQuote;
    if (approved) {
      const pricingHash = this.quoteHash(modelQuote);
      if (
        !resolvedModelDoc ||
        resolvedModelDoc.key !== model ||
        !resolvedModelDoc.isActive ||
        resolvedModelDoc.isDeleted ||
        resolvedModelDoc.category !==
          (isImageEditModel(model)
            ? ModelCategory.IMAGE_EDIT
            : ModelCategory.IMAGE) ||
        !this.providerRegistry.supports(model, resolvedModelDoc.provider) ||
        model !== approved.model ||
        requiredCredits !== approved.unitCredits ||
        (byok ? 'byok' : 'credits') !== approved.billingMode ||
        pricingHash !== approved.pricingHash
      ) {
        throw new ConflictException(
          'Image pricing, model or billing mode changed. Request a fresh quote.',
        );
      }
    }
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

  /**
   * The single BYOK decision point for image generation (#5294). Resolves
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

  private quoteHash(snapshot: ModelBillableQuoteSnapshot): string {
    const { quotedAt: _quotedAt, ...identity } = snapshot;
    return quoteSnapshotHash(identity);
  }

  private async resolveRequiredCredits(
    createImageDto: CreateImageDto,
    model: string,
    organizationId: string,
    providerInput?: Record<string, unknown>,
  ) {
    const resolvedModelDoc = await this.modelsService.findOne({ key: model });
    const provider = this.providerRegistry.providerFor(
      model,
      resolvedModelDoc?.provider,
    );
    if (!provider)
      throw new ConflictException(
        'The selected image provider is unavailable.',
      );
    const outputs = resolveImageBillableOutputs(
      provider,
      createImageDto.outputs ?? 1,
    );
    const modelQuote = await this.modelCreditQuote.quoteSnapshotByKey(model, {
      organizationId,
      provider,
      providerInput,
      height: createImageDto.height || 1080,
      width: createImageDto.width || 1920,
      outputs,
      requests: isNativeImageBatch(model, provider) ? 1 : outputs,
      ...(isFlux3ImageModel(model)
        ? { selectors: { resolution: createImageDto.resolution ?? '1k' } }
        : createImageDto.quality !== undefined
          ? { selectors: { quality: createImageDto.quality } }
          : {}),
    });
    return {
      requiredCredits: modelQuote.credits,
      resolvedModelDoc,
      modelQuote,
    };
  }
}
