import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { ModelLifecycle } from '@genfeedai/contracts';
import {
  getModelCatalogForDeployment,
  isRetiredAgentChatModel,
  type ModelCatalogSeedEntry,
  shouldUseLowestCostModelDefaults,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type ModelCatalogSeedResult = {
  unchanged: number;
  written: number;
};

type ExistingModelRow = {
  aspectRatios: unknown;
  capabilities: unknown;
  category: unknown;
  config: unknown;
  cost: unknown;
  costPerUnit: unknown;
  costTier: unknown;
  defaultAspectRatio: unknown;
  defaultDuration: unknown;
  description: unknown;
  durations: unknown;
  endpoint: unknown;
  externalId: unknown;
  hasAudioToggle: unknown;
  hasDurationEditing: unknown;
  hasEndFrame: unknown;
  hasInterpolation: unknown;
  hasResolutionOptions: unknown;
  hasSpeech: unknown;
  id: string;
  inputCostPerMillionTokens: unknown;
  isActive: boolean;
  isBatchSupported: unknown;
  isDefault: boolean;
  isDeleted: boolean;
  isDiscovered: boolean;
  isFree: unknown;
  isImagenModel: unknown;
  isLegacy: boolean;
  isPublic: boolean;
  isReferencesMandatory: unknown;
  label: unknown;
  lifecycle: string;
  maxOutputs: unknown;
  maxReferences: unknown;
  minCost: unknown;
  outputCostPerMillionTokens: unknown;
  pricingType: unknown;
  provider: unknown;
  providerCostUsd: unknown;
  qualityTier: unknown;
  recommendedFor: unknown;
  speedTier: unknown;
  succeededBy: unknown;
  supportsFeatures: unknown;
  usesOrientation: unknown;
};

const EXISTING_MODEL_SELECT = {
  aspectRatios: true,
  capabilities: true,
  category: true,
  config: true,
  cost: true,
  costPerUnit: true,
  costTier: true,
  defaultAspectRatio: true,
  defaultDuration: true,
  description: true,
  durations: true,
  endpoint: true,
  externalId: true,
  hasAudioToggle: true,
  hasDurationEditing: true,
  hasEndFrame: true,
  hasInterpolation: true,
  hasResolutionOptions: true,
  hasSpeech: true,
  id: true,
  inputCostPerMillionTokens: true,
  isActive: true,
  isBatchSupported: true,
  isDefault: true,
  isDeleted: true,
  isDiscovered: true,
  isFree: true,
  isImagenModel: true,
  isLegacy: true,
  isPublic: true,
  isReferencesMandatory: true,
  label: true,
  lifecycle: true,
  maxOutputs: true,
  maxReferences: true,
  minCost: true,
  outputCostPerMillionTokens: true,
  pricingType: true,
  provider: true,
  providerCostUsd: true,
  qualityTier: true,
  recommendedFor: true,
  speedTier: true,
  succeededBy: true,
  supportsFeatures: true,
  usesOrientation: true,
} as const;

@Injectable()
export class ModelCatalogSeedService {
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

  async reconcileCatalog(
    catalog: readonly ModelCatalogSeedEntry[] = this.resolveSeedCatalog(),
  ): Promise<ModelCatalogSeedResult> {
    let written = 0;
    let unchanged = 0;
    const failedKeys: string[] = [];

    for (const entry of catalog) {
      try {
        const outcome = await this.upsertEntry(entry);
        if (outcome === 'written') written += 1;
        else unchanged += 1;
      } catch (error) {
        failedKeys.push(entry.key);
        this.logger.error(
          `Model catalog entry failed to reconcile: ${entry.key}`,
          error instanceof Error ? error : new Error(String(error)),
          this.context,
        );
      }
    }

    if (failedKeys.length > 0) {
      throw new Error(
        `Model catalog reconcile failed for: ${failedKeys.join(', ')}`,
      );
    }

    this.logger.log(
      `Model catalog reconciled (written=${written}, unchanged=${unchanged})`,
      this.context,
    );

    return { unchanged, written };
  }

  /**
   * Fields the seed owns outright — labels, categories, capability metadata.
   * Rewritten on every sync so a catalogue correction reaches existing rows.
   * `lifecycle` is written by `upsertEntry`, which lets an operator demotion
   * survive; activation (`isActive`, `isPublic`, `isDefault`) is deliberately
   * not here — see `upsertEntry`.
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
      ...(entry.qualityTier ? { qualityTier: entry.qualityTier } : {}),
      ...(entry.speedTier ? { speedTier: entry.speedTier } : {}),
      ...(entry.defaultAspectRatio
        ? { defaultAspectRatio: entry.defaultAspectRatio }
        : {}),
      ...(entry.defaultDuration != null
        ? { defaultDuration: entry.defaultDuration }
        : {}),
      ...(entry.durations ? { durations: [...entry.durations] } : {}),
      ...(entry.externalId ? { externalId: entry.externalId } : {}),
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
   * Whether an *existing* row should have `isDefault` written on this sync.
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

  /**
   * An operator demotion is `isLegacy` (the "hide this row" flag only
   * `ModelsService.transitionLifecycle` sets — the catalog always seeds it
   * false, so a curated LEGACY row stays selectable) or a row already sitting
   * at RETIRED. That pair is exactly what the dropped `isDeprecated` column
   * used to spell, since it was only ever written as `isLegacy || isRetired`.
   */
  // `lifecycle` arrives as Prisma's generated enum, a nominally distinct type
  // from the domain `ModelLifecycle` even though the enum rule keeps both
  // label sets identical. Typing the row's column as the persisted string and
  // comparing against a domain member keeps the two in step without a cast.
  private isLifecyclePinnedByOperator(
    existingRow: { isLegacy: boolean; lifecycle: string } | null,
    entry: ModelCatalogSeedEntry,
  ): boolean {
    if (!existingRow) {
      return false;
    }
    const hasOperatorDemotion =
      existingRow.isLegacy || existingRow.lifecycle === ModelLifecycle.RETIRED;
    const isCatalogDemotion =
      entry.lifecycle === ModelLifecycle.LEGACY ||
      entry.lifecycle === ModelLifecycle.RETIRED;
    return hasOperatorDemotion && !isCatalogDemotion;
  }

  private async upsertEntry(
    entry: ModelCatalogSeedEntry,
  ): Promise<'unchanged' | 'written'> {
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
      isLegacy: false,
      isPublic: entry.isPublic ?? true,
      lifecycle: entry.lifecycle,
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

    // tenant-scope-ignore: platform registry has no organizationId; `key` is its only unique index
    const existingRow = (await this.prisma.model.findUnique({
      select: EXISTING_MODEL_SELECT,
      where: { key: entry.key },
    })) as ExistingModelRow | null;
    const updateData: Prisma.ModelUpdateInput = {
      ...shared,
      ...(entry.endpoint ? { endpoint: entry.endpoint } : {}),
      ...(this.isLifecyclePinnedByOperator(existingRow, entry)
        ? {}
        : { lifecycle: entry.lifecycle }),
      isDeleted: false,
      ...(entry.cost > 0 || entry.isFree ? { cost: entry.cost } : {}),
      ...(entry.isFree ? { isFree: true } : {}),
      ...(entry.costPerUnit != null ? { costPerUnit: entry.costPerUnit } : {}),
      ...(entry.minCost != null ? { minCost: entry.minCost } : {}),
      ...(entry.pricingType ? { pricingType: entry.pricingType } : {}),
      ...(entry.providerCostUsd != null
        ? { providerCostUsd: entry.providerCostUsd }
        : {}),
    };

    if (!existingRow) {
      if (entry.isDefault) {
        await this.demoteOtherCategoryDefaults(entry);
      }
    } else {
      const targetIsDefault = await this.resolveUpdateIsDefault(entry);
      const isFirstCuration =
        asNumber(existingRow.cost) === 0 && entry.cost > 0 && entry.isActive;
      let hasOperatorFieldWrite = false;

      if (targetIsDefault !== undefined) {
        const alreadyHoldsPin =
          existingRow.isDefault === targetIsDefault &&
          (!targetIsDefault ||
            (existingRow.isActive === true &&
              existingRow.isDiscovered === false &&
              existingRow.isPublic === true));
        if (!alreadyHoldsPin) {
          if (targetIsDefault) {
            await this.demoteOtherCategoryDefaults(entry);
            updateData.isActive = true;
            updateData.isDiscovered = false;
            updateData.isPublic = true;
          }
          updateData.isDefault = targetIsDefault;
          hasOperatorFieldWrite = true;
        }
      }

      if (isFirstCuration) {
        const alreadyActivated =
          existingRow.isActive === true &&
          existingRow.isPublic === (entry.isPublic ?? true);
        if (!alreadyActivated) {
          updateData.isActive = true;
          updateData.isPublic = entry.isPublic ?? true;
          hasOperatorFieldWrite = true;
        }
      }
      if (
        !hasOperatorFieldWrite &&
        this.isSeedOwnedSnapshotMatch(existingRow, entry, shared)
      ) {
        return 'unchanged';
      }
    }

    // tenant-scope-ignore: the seeded catalog is the platform-wide registry (organizationId null) and `key` is its only unique index
    await this.prisma.model.upsert({
      create: createData,
      update: updateData,
      where: { key: entry.key },
    });
    return 'written';
  }

  private isSeedOwnedSnapshotMatch(
    row: ExistingModelRow,
    entry: ModelCatalogSeedEntry,
    shared: ReturnType<ModelCatalogSeedService['buildSharedFields']>,
  ): boolean {
    if (row.isDeleted) return false;
    for (const [key, value] of Object.entries(shared)) {
      if (!sameJson(row[key as keyof ExistingModelRow], value)) return false;
    }
    if (
      !this.isLifecyclePinnedByOperator(row, entry) &&
      !sameJson(row.lifecycle, entry.lifecycle)
    ) {
      return false;
    }
    if (entry.endpoint && !sameJson(row.endpoint, entry.endpoint)) return false;
    if ((entry.cost > 0 || entry.isFree) && asNumber(row.cost) !== entry.cost) {
      return false;
    }
    if (entry.isFree && row.isFree !== true) return false;
    if (
      entry.costPerUnit != null &&
      asNumber(row.costPerUnit) !== entry.costPerUnit
    ) {
      return false;
    }
    if (entry.minCost != null && asNumber(row.minCost) !== entry.minCost) {
      return false;
    }
    if (entry.pricingType && !sameJson(row.pricingType, entry.pricingType)) {
      return false;
    }
    if (
      entry.providerCostUsd != null &&
      asNumber(row.providerCostUsd) !== entry.providerCostUsd
    ) {
      return false;
    }
    return true;
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (
    value !== null &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    return value.toNumber();
  }
  return undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeJson(left)) === JSON.stringify(normalizeJson(right))
  );
}

function normalizeJson(value: unknown): unknown {
  if (value == null) return null;
  const numeric = asNumber(value);
  if (numeric !== undefined && (typeof value !== 'object' || value === null)) {
    return numeric;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    return value.toNumber();
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalizeJson(nested)]),
    );
  }
  return value;
}
