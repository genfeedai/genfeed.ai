/**
 * Upserts the unified model catalog into the `Model` registry on boot.
 *
 * Runs for self-hosted and cloud alike so Settings → Models, the agent picker
 * and the routers always have registry rows to read instead of a hard-coded
 * list. Idempotent by design: operator toggles and prices discovered from a
 * provider survive every subsequent boot.
 */

import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import {
  getModelCatalogForDeployment,
  isRetiredAgentChatModel,
  type ModelCatalogSeedEntry,
  shouldUseLowestCostModelDefaults,
} from '@genfeedai/constants';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class ModelCatalogSeedService implements OnApplicationBootstrap {
  private readonly context = 'ModelCatalogSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  private resolveSeedCatalog(): readonly ModelCatalogSeedEntry[] {
    return getModelCatalogForDeployment(
      !shouldUseLowestCostModelDefaults({
        isCloud: isCloudDeployment(),
        nodeEnv: this.configService.get('NODE_ENV'),
      }),
    );
  }

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

  async reconcileCatalog(
    catalog: readonly ModelCatalogSeedEntry[] = this.resolveSeedCatalog(),
  ): Promise<number> {
    let upserted = 0;

    for (const entry of catalog) {
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
      ...(entry.hasAudioToggle != null
        ? { hasAudioToggle: entry.hasAudioToggle }
        : {}),
      ...(entry.hasDurationEditing != null
        ? { hasDurationEditing: entry.hasDurationEditing }
        : {}),
      ...(entry.hasEndFrame != null ? { hasEndFrame: entry.hasEndFrame } : {}),
      ...(entry.hasInterpolation != null
        ? { hasInterpolation: entry.hasInterpolation }
        : {}),
      ...(entry.hasResolutionOptions != null
        ? { hasResolutionOptions: entry.hasResolutionOptions }
        : {}),
      ...(entry.hasSpeech != null ? { hasSpeech: entry.hasSpeech } : {}),
      ...(entry.inputCostPerMillionTokens != null
        ? { inputCostPerMillionTokens: entry.inputCostPerMillionTokens }
        : {}),
      ...(entry.isBatchSupported != null
        ? { isBatchSupported: entry.isBatchSupported }
        : {}),
      ...(entry.isImagenModel != null
        ? { isImagenModel: entry.isImagenModel }
        : {}),
      ...(entry.isReferencesMandatory != null
        ? { isReferencesMandatory: entry.isReferencesMandatory }
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
      ...(entry.usesOrientation != null
        ? { usesOrientation: entry.usesOrientation }
        : {}),
    };
  }

  /**
   * Exactly one default per category (`models_global_default_category_key`).
   * Demote every other row's `isDefault` *before* this entry is allowed to
   * claim it, or the partial unique index rejects the write. The index
   * ignores `isActive`, so a disabled-but-not-deleted row can still hold the
   * flag and must be cleared too.
   */
  private async demoteOtherCategoryDefaults(
    entry: ModelCatalogSeedEntry,
  ): Promise<void> {
    // tenant-scope-ignore: platform registry has no organizationId
    await this.prisma.model.updateMany({
      data: { isDefault: false },
      where: {
        category: entry.category,
        isDefault: true,
        isDeleted: false,
        key: { not: entry.key },
      },
    });
  }

  /**
   * Whether an *existing* row should have `isDefault` written on this boot.
   *
   * `undefined` means "leave it alone" — the catalog doesn't name this key as
   * the category default, so touching the field here could demote an admin's
   * own pin of this exact row (Settings → Models, PATCH `/models/:id`).
   *
   * When the catalog does name this key as the default, the seed still only
   * self-heals: it reclaims the pin when the category has no usable
   * (active, non-deleted, non-legacy) default at all, and otherwise leaves
   * whatever already holds the pin — this row or another — untouched.
   */
  private async resolveUpdateIsDefault(
    entry: ModelCatalogSeedEntry,
  ): Promise<boolean | undefined> {
    if (!entry.isDefault) {
      return undefined;
    }

    // tenant-scope-ignore: platform registry has no organizationId
    const activeDefault = await this.prisma.model.findFirst({
      select: { key: true },
      where: {
        category: entry.category,
        isActive: true,
        isDefault: true,
        isDeleted: false,
        isLegacy: false,
      },
    });

    if (!activeDefault || isRetiredAgentChatModel(activeDefault.key)) {
      return true;
    }

    return activeDefault.key === entry.key;
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
      isFree: entry.isFree ?? false,
      isLegacy: entry.isLegacy ?? false,
      lifecycle: entry.lifecycle,
      isPublic: entry.isPublic ?? true,
      endpoint: entry.endpoint ?? entry.key,
      key: entry.key,
      label: entry.label,
      provider: entry.provider,
      ...(entry.costPerUnit != null ? { costPerUnit: entry.costPerUnit } : {}),
      ...(entry.minCost != null ? { minCost: entry.minCost } : {}),
      ...(entry.pricingType ? { pricingType: entry.pricingType } : {}),
      ...(entry.providerCostUsd != null
        ? { providerCostUsd: entry.providerCostUsd }
        : {}),
    };

    const updateData: Prisma.ModelUpdateInput = {
      ...shared,
      endpoint: entry.endpoint ?? entry.key,
      isDeleted: false,
      // `isActive` and `cost` stay operator/discovery territory: a curated row
      // may have been priced or disabled deliberately, and the seed's 0 for an
      // uncurated key would hand out free generations. A row the catalog
      // declares free is the exception — there 0 is the curated price, so
      // holding a stale non-zero cost would bill a round the provider gave away.
      ...(entry.cost > 0 || entry.isFree ? { cost: entry.cost } : {}),
      ...(entry.isFree ? { isFree: true } : {}),
      // Unit pricing + provider USD must not lag the catalog — bill time prefers
      // providerCostUsd × live applyMargin.
      ...(entry.costPerUnit != null ? { costPerUnit: entry.costPerUnit } : {}),
      ...(entry.minCost != null ? { minCost: entry.minCost } : {}),
      ...(entry.pricingType ? { pricingType: entry.pricingType } : {}),
      ...(entry.providerCostUsd != null
        ? { providerCostUsd: entry.providerCostUsd }
        : {}),
      // `isDefault` is deliberately absent here — see resolveUpdateIsDefault.
      ...(entry.isLegacy
        ? { isActive: false, isDefault: false, isPublic: false }
        : {}),
    };

    // tenant-scope-ignore: platform registry has no organizationId; `key` is its only unique index
    const existingRow = await this.prisma.model.findUnique({
      select: { id: true },
      where: { key: entry.key },
    });

    if (!existingRow) {
      // Brand-new key: seed every field exactly once, including the
      // catalog's declared default.
      if (entry.isDefault) {
        await this.demoteOtherCategoryDefaults(entry);
      }
    } else {
      // Row already exists — never assert or demote `isDefault` on a routine
      // boot beyond the self-heal case; an admin's pin must survive restarts.
      const targetIsDefault = await this.resolveUpdateIsDefault(entry);

      if (targetIsDefault !== undefined) {
        if (targetIsDefault) {
          await this.demoteOtherCategoryDefaults(entry);
          updateData.isActive = true;
          updateData.isDiscovered = false;
          updateData.lifecycle = entry.lifecycle;
          updateData.isPublic = true;
        }
        updateData.isDefault = targetIsDefault;
      }
    }

    // tenant-scope-ignore: the seeded catalog is the platform-wide registry (organizationId null) and `key` is its only unique index
    await this.prisma.model.upsert({
      create: createData,
      update: updateData,
      where: { key: entry.key },
    });
  }
}
