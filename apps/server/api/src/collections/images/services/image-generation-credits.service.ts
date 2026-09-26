import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
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
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import {
  buildPricingAuditStamp,
  calculateImageGenerationCredits,
} from '@genfeedai/pricing';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class ImageGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
    private readonly byokService: ByokService,
  ) {}

  async quoteCredits(
    dto: CreateImageDto,
    model: string,
    organizationId: string,
  ) {
    const { requiredCredits, resolvedModelDoc } =
      await this.resolveRequiredCredits(dto, model);
    if (
      !resolvedModelDoc ||
      resolvedModelDoc.key !== model ||
      !resolvedModelDoc.isActive ||
      resolvedModelDoc.isDeleted ||
      resolvedModelDoc.category !== ModelCategory.IMAGE ||
      !this.providerRegistry.supports(model, resolvedModelDoc.provider)
    ) {
      throw new ConflictException(
        'The selected image model is unavailable for an exact quote.',
      );
    }
    const byokProvider = await this.resolveActiveByokProvider(
      organizationId,
      model,
      resolvedModelDoc.provider,
    );
    return {
      unitCredits: requiredCredits,
      billingMode: byokProvider ? ('byok' as const) : ('credits' as const),
      provider: byokProvider ?? resolvedModelDoc.provider,
      pricingHash: quoteSnapshotHash({
        model,
        pricing: buildPricingAuditStamp(resolvedModelDoc),
        provider: this.providerRegistry.providerFor(
          model,
          resolvedModelDoc.provider,
        ),
      }),
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
    const approved = reqWithCredits.creditsConfig?.approvedImageQuote;
    if (approved) {
      const pricingHash = quoteSnapshotHash({
        model,
        pricing: resolvedModelDoc
          ? buildPricingAuditStamp(resolvedModelDoc)
          : null,
        provider: this.providerRegistry.providerFor(
          model,
          resolvedModelDoc?.provider,
        ),
      });
      if (
        !resolvedModelDoc ||
        resolvedModelDoc.key !== model ||
        !resolvedModelDoc.isActive ||
        resolvedModelDoc.isDeleted ||
        resolvedModelDoc.category !== ModelCategory.IMAGE ||
        !this.providerRegistry.supports(model, resolvedModelDoc.provider) ||
        model !== approved.model ||
        requiredCredits !== approved.unitCredits ||
        (byokProvider ? 'byok' : 'credits') !== approved.billingMode ||
        pricingHash !== approved.pricingHash
      ) {
        throw new ConflictException(
          'Image pricing, model or billing mode changed. Request a fresh quote.',
        );
      }
    }
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
    return provider;
  }

  private async resolveRequiredCredits(
    createImageDto: CreateImageDto,
    model: string,
  ) {
    const resolvedModelDoc = await this.modelsService.findOne({
      key: baseModelKey(model),
    });
    // #4813 Same calculator the Agent quote uses; only the inputs differ. The
    // row's provider resolves dispatch exactly as image execution does, so a
    // Fal row with a generic key is never billed with Replicate semantics.
    const { credits: requiredCredits } = calculateImageGenerationCredits({
      height: createImageDto.height,
      imageProvider: this.providerRegistry.providerFor(
        model,
        resolvedModelDoc?.provider,
      ),
      isBatchSupported:
        MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false,
      modelKey: model,
      outputs: createImageDto.outputs,
      pricing: resolvedModelDoc,
      quality: createImageDto.quality,
      width: createImageDto.width,
    });

    return { requiredCredits, resolvedModelDoc };
  }
}
