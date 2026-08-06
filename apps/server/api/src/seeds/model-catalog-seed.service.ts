/**
 * Upserts the unified model catalog into the Model registry on boot.
 * Runs for self-hosted and cloud so Settings / agent picker always have rows.
 * Idempotent: preserves operator isActive toggles except for default models.
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

  private async upsertEntry(entry: ModelCatalogSeedEntry): Promise<void> {
    const createData: Prisma.ModelCreateInput = {
      category: entry.category,
      cost: entry.cost,
      description: entry.description,
      isActive: entry.isActive,
      isDefault: entry.isDefault ?? false,
      isDiscovered: false,
      isHighlighted: entry.isHighlighted ?? false,
      isLegacy: entry.isLegacy ?? false,
      isPublic: entry.isPublic ?? true,
      key: entry.key,
      label: entry.label,
      provider: entry.provider,
      ...(entry.aspectRatios ? { aspectRatios: [...entry.aspectRatios] } : {}),
      ...(entry.capabilities ? { capabilities: [...entry.capabilities] } : {}),
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
    };

    const updateData: Prisma.ModelUpdateInput = {
      category: entry.category,
      cost: entry.cost,
      description: entry.description,
      isDeleted: false,
      isLegacy: entry.isLegacy ?? false,
      label: entry.label,
      provider: entry.provider,
      // Keep default models active so the router always has a selection.
      ...(entry.isDefault ? { isActive: true, isDefault: true } : {}),
      ...(entry.aspectRatios ? { aspectRatios: [...entry.aspectRatios] } : {}),
      ...(entry.capabilities ? { capabilities: [...entry.capabilities] } : {}),
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
    };

    await this.prisma.model.upsert({
      create: createData,
      update: updateData,
      where: { key: entry.key },
    });
  }
}
