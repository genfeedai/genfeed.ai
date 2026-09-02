import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { IMediaGenerationCostContext } from '@genfeedai/contracts/interfaces';
import {
  computeMediaVendorCostMicros,
  resolveProviderCostUnits,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
  ) {}

  async recordGenerationCost(
    context: IMediaGenerationCostContext,
  ): Promise<void> {
    try {
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

      const model = await this.modelsService.findOne({
        key: baseModelKey(context.modelKey),
      });
      if (!model) {
        this.logger.debug(
          `${this.constructorName} skipping ledger row — unknown model`,
          { ingredientId: context.ingredientId, modelKey: context.modelKey },
        );
        return;
      }

      const byokProvider = resolveModelByokProvider(
        context.modelKey,
        model.provider,
      );
      const isByok = byokProvider
        ? await this.byokService.isByokActiveForProvider(
            context.organizationId,
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
        brandId: context.brandId ?? null,
        category: context.category,
        ingredientId: context.ingredientId,
        isByok,
        model: model.key ?? context.modelKey,
        organizationId: context.organizationId,
        pricingType: model.pricingType ?? null,
        provider: byokProvider ?? model.provider ?? 'unknown',
        units,
        vendorCostMicros,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to record media vendor cost`,
        { error, ingredientId: context.ingredientId },
      );
    }
  }
}
