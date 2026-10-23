import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import {
  generationQuoteGroupMetadataSchema,
  generationQuoteGroupReceiptSchema,
} from '@api/helpers/utils/credits/generation-quote-group.schema';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IMediaGenerationCostContext } from '@genfeedai/contracts/interfaces';
import {
  computeMediaVendorCostMicros,
  resolveProviderCostUnits,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type CostModel = NonNullable<Awaited<ReturnType<ModelsService['findOne']>>>;

type CostIngredient = {
  generationBilling?: unknown;
  metadata?: { externalProvider?: string | null } | null;
} | null;

/**
 * Records what a finalized media generation actually cost the platform,
 * mirroring the LLM vendor-cost ledger (#2361) for image/video/music paths.
 *
 * Called from the webhook finalize choke point with the realized output
 * (actual duration/dimensions, not the requested ones). BYOK generations are
 * recorded with vendorCostMicros = 0. Best-effort by contract: any failure is
 * logged and swallowed so the ledger can never break a generation.
 *
 * The webhook finalize and synchronous image completion paths both call this
 * service. MediaVendorCostLedgerService de-duplicates them by organization +
 * ingredient so retries cannot inflate agency reports.
 */
@Injectable()
export class MediaGenerationCostService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly modelsService: ModelsService,
    private readonly byokService: ByokService,
    private readonly ledgerService: MediaVendorCostLedgerService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  async recordGenerationCost(
    context: IMediaGenerationCostContext,
  ): Promise<void> {
    try {
      if (
        context.organizationId &&
        (await this.prisma.crunGenerationTask.findFirst({
          where: {
            ingredientId: context.ingredientId,
            organizationId: context.organizationId,
            isDeleted: false,
          },
          select: { id: true },
        }))
      )
        return; // Crun finalizer records authenticated frozen receipts.
      if (!context.organizationId || !context.modelKey) {
        this.logger.debug(
          `${this.constructorName} skipping ledger row — missing org or model`,
          {
            hasModelKey: Boolean(context.modelKey),
            hasOrganizationId: Boolean(context.organizationId),
            ingredientId: context.ingredientId,
          },
        );
        return;
      }

      const ingredient = await this.prisma.ingredient.findFirst({
        where: {
          id: context.ingredientId,
          organizationId: context.organizationId,
          isDeleted: false,
        },
        select: {
          generationBilling: true,
          metadata: { select: { externalProvider: true } },
        },
      });
      if (
        await this.recordRoutedGenerationCost(
          context,
          context.organizationId,
          context.modelKey,
          ingredient,
        )
      )
        return;
      let model = await this.modelsService.findOne({
        key: baseModelKey(context.modelKey),
      });
      if (!model) {
        this.logger.debug(
          `${this.constructorName} skipping ledger row — unknown model`,
          { ingredientId: context.ingredientId, modelKey: context.modelKey },
        );
        return;
      }

      if (
        ingredient?.metadata?.externalProvider &&
        ingredient.metadata.externalProvider !== model.provider
      ) {
        model = await this.resolveActualProviderModel(
          context.organizationId,
          model,
          ingredient.metadata.externalProvider,
        );
      }
      await this.recordModelGenerationCost(
        context,
        context.organizationId,
        context.modelKey,
        model,
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to record media vendor cost`,
        { error, ingredientId: context.ingredientId },
      );
    }
  }

  /**
   * Records a generation that was routed through a frozen provider quote.
   * Returns false when the ingredient carries no routed-dispatch receipt, so
   * the caller falls back to model-based pricing.
   */
  private async recordRoutedGenerationCost(
    context: IMediaGenerationCostContext,
    organizationId: string,
    modelKey: string,
    ingredient: CostIngredient,
  ): Promise<boolean> {
    const receipt = generationQuoteGroupReceiptSchema.safeParse(
      ingredient?.generationBilling,
    );
    if (!receipt.success) return false;
    const hold = await this.prisma.creditReservation.findFirst({
      where: {
        id: receipt.data.reservationId,
        organizationId,
        isDeleted: false,
      },
      select: { metadata: true },
    });
    const metadata = generationQuoteGroupMetadataSchema.safeParse(
      hold?.metadata,
    );
    if (!metadata.success || !metadata.data.modelQuote.routedDispatch)
      return false;
    const quote = metadata.data.modelQuote;
    const route = metadata.data.modelQuote.routedDispatch;
    const actualProvider = ingredient?.metadata?.externalProvider;
    const cost =
      actualProvider === route.provider
        ? quote.providerCostUsd
        : route.fallback && actualProvider === route.fallback.provider
          ? route.fallback.providerCostUsd
          : null;
    if (cost === null || cost === undefined || !actualProvider)
      throw new Error(
        'Routed generation has no matching frozen provider-cost evidence',
      );
    await this.ledgerService.record({
      brandId: context.brandId ?? null,
      category: context.category,
      ingredientId: context.ingredientId,
      isByok: false,
      model: modelKey,
      organizationId,
      pricingType: 'flat',
      provider: actualProvider,
      units: 1,
      vendorCostMicros: Math.round(
        (cost * 1000000) / (quote.quantities.outputs ?? 1),
      ),
      costEvidence: 'calculated',
      pricingSnapshot: {
        offerId:
          actualProvider === route.provider
            ? route.offerId
            : (route.fallback?.offerId ?? null),
        customerQuotedCredits: quote.credits,
        quotedProviderCostUsd: cost,
      },
    });
    return true;
  }

  /** Swaps in the execution model of the provider that actually ran. */
  private async resolveActualProviderModel(
    organizationId: string,
    model: CostModel,
    actualProvider: string,
  ): Promise<CostModel> {
    const offer = await this.prisma.modelProviderOffer.findFirst({
      where: {
        modelId: model.id,
        executionModel: {
          is: {
            provider: actualProvider,
            isDeleted: false,
            OR: [{ organizationId }, { organizationId: null }],
          },
        },
      },
      select: { executionModel: { select: { key: true } } },
    });
    if (!offer) throw new Error('Actual provider has no model association');
    const registration = await this.modelsService.findOne({
      key: offer.executionModel.key,
    });
    if (!registration) throw new Error('Provider registration is unavailable');
    return registration;
  }

  private async recordModelGenerationCost(
    context: IMediaGenerationCostContext,
    organizationId: string,
    modelKey: string,
    model: CostModel,
  ): Promise<void> {
    const byokProvider = resolveModelByokProvider(modelKey, model.provider);
    const isByok = byokProvider
      ? await this.byokService.isByokActiveForProvider(
          organizationId,
          byokProvider,
        )
      : false;

    const unitOptions = {
      duration: context.durationSeconds ?? undefined,
      height: context.height ?? undefined,
      width: context.width ?? undefined,
    };
    const units = resolveProviderCostUnits(
      model.pricingType,
      model.defaultDuration,
      unitOptions,
    );
    const vendorCostMicros = isByok
      ? 0
      : computeMediaVendorCostMicros(model, unitOptions);

    await this.ledgerService.record({
      realizedDurationSeconds: context.durationSeconds,
      realizedWidth: context.width,
      realizedHeight: context.height,
      costEvidence: isByok
        ? 'byok'
        : typeof model.providerCostUsd === 'number' &&
            model.providerCostUsd > 0 &&
            (model.pricingType !== 'per-second' ||
              (context.durationSeconds ?? 0) > 0) &&
            (model.pricingType !== 'per-megapixel' ||
              ((context.width ?? 0) > 0 && (context.height ?? 0) > 0))
          ? 'calculated'
          : 'unknown',
      brandId: context.brandId ?? null,
      category: context.category,
      ingredientId: context.ingredientId,
      isByok,
      model: modelKey,
      organizationId,
      pricingType: model.pricingType ?? null,
      provider: byokProvider ?? model.provider ?? 'unknown',
      units,
      vendorCostMicros,
    });
  }
}
