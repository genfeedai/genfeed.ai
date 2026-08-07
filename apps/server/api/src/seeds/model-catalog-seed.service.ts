/**
 * Upserts the unified model catalog into the `Model` registry on boot.
 *
 * Runs for self-hosted and cloud alike so Settings → Models, the agent picker
 * and the routers always have registry rows to read instead of a hard-coded
 * list. Idempotent by design: operator toggles and prices discovered from a
 * provider survive every subsequent boot.
 */
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type ModelCatalogSeedEntry,
  UNIFIED_MODEL_CATALOG,
} from '@genfeedai/constants';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class ModelCatalogSeedService implements OnApplicationBootstrap {
  private readonly context = 'ModelCatalogSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcileCatalog();
    } catch (error) {
      this.logger.error(
        'Model catalog seed failed — registry may be incomplete',
        error instanceof Error ? error : new Error(String(error)),
        this.context,
      );
    }
  }

  async reconcileCatalog(): Promise<number> {
    let upserted = 0;

    for (const entry of UNIFIED_MODEL_CATALOG) {
      await this.upsertEntry(entry);
      upserted += 1;
    }

    this.logger.log(
      `Model catalog reconciled (${upserted} registry rows)`,
      this.context,
    );

    return upserted;
  }

  /**
   * Fields the seed owns outright — labels, categories, capability metadata.
   * Rewritten on every boot so a catalogue correction reaches existing rows.
   */
  // Plain scalar values only — inferred so the same shape spreads into both
  // ModelCreateInput and ModelUpdateInput without update-operation unions.
  private buildSharedFields(entry: ModelCatalogSeedEntry) {
    return {
      category: entry.category,
      description: entry.description,
      isLegacy: entry.isLegacy ?? false,
      label: entry.label,
      provider: entry.provider,
      ...(entry.aspectRatios ? { aspectRatios: [...entry.aspectRatios] } : {}),
      ...(entry.capabilities ? { capabilities: [...entry.capabilities] } : {}),
      ...(entry.config ? { config: entry.config } : {}),
      ...(entry.costTier ? { costTier: entry.costTier } : {}),
      ...(entry.defaultAspectRatio
        ? { defaultAspectRatio: entry.defaultAspectRatio }
        : {}),
      ...(entry.defaultDuration != null
        ? { defaultDuration: entry.defaultDuration }
        : {}),
      ...(entry.durations ? { durations: [...entry.durations] } : {}),
      ...(entry.inputCostPerMillionTokens != null
        ? { inputCostPerMillionTokens: entry.inputCostPerMillionTokens }
        : {}),
      ...(entry.maxOutputs != null ? { maxOutputs: entry.maxOutputs } : {}),
      ...(entry.maxReferences != null
        ? { maxReferences: entry.maxReferences }
        : {}),
      ...(entry.outputCostPerMillionTokens != null
        ? { outputCostPerMillionTokens: entry.outputCostPerMillionTokens }
        : {}),
      ...(entry.recommendedFor
        ? { recommendedFor: [...entry.recommendedFor] }
        : {}),
      ...(entry.succeededBy ? { succeededBy: entry.succeededBy } : {}),
      ...(entry.supportsFeatures
        ? { supportsFeatures: [...entry.supportsFeatures] }
        : {}),
    };
  }

  private async upsertEntry(entry: ModelCatalogSeedEntry): Promise<void> {
    const shared = this.buildSharedFields(entry);

    const createData: Prisma.ModelCreateInput = {
      ...shared,
      category: entry.category,
      cost: entry.cost,
      description: entry.description,
      isActive: entry.isActive,
      isDefault: entry.isDefault ?? false,
      isDiscovered: false,
      isHighlighted: entry.isHighlighted ?? false,
      isPublic: entry.isPublic ?? true,
      key: entry.key,
      label: entry.label,
      provider: entry.provider,
    };

    const updateData: Prisma.ModelUpdateInput = {
      ...shared,
      isDeleted: false,
      // `isActive` and `cost` stay operator/discovery territory: a curated row
      // may have been priced or disabled deliberately, and the seed's 0 for an
      // uncurated key would hand out free generations.
      ...(entry.cost > 0 ? { cost: entry.cost } : {}),
      // Defaults are the one exception — the router needs a live selection.
      ...(entry.isDefault ? { isActive: true, isDefault: true } : {}),
    };

    // tenant-scope-ignore: the seeded catalog is the platform-wide registry (organizationId null) and `key` is its only unique index
    await this.prisma.model.upsert({
      create: createData,
      update: updateData,
      where: { key: entry.key },
    });
  }
}
