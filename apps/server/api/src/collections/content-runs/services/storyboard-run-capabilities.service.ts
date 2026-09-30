import { createHash } from 'node:crypto';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { isModelOnAllowlist } from '@api/collections/models/utils/enabled-model.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import { getVideoGenerationBriefRegistryEntry } from '@api/services/generation-brief/video-generation-brief-registry';
import { RouterService } from '@api/services/router/router.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import type { StoryboardRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  type CapabilityReason,
  type StoryboardRunCapabilities,
  type StoryboardVideoModelCapability,
  storyboardRunCapabilitiesSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { MINIMAX_H3_CAPABILITY_PROFILE } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import {
  getModelDefaultDuration,
  getModelDurations,
  hasInterpolation,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { getModelCapability } from '@genfeedai/helpers/model-capability.helper';
import { Injectable } from '@nestjs/common';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}

export function storyboardProviderMapping(key: string) {
  const registry = getVideoGenerationBriefRegistryEntry(key);
  const family = REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES.find((value) =>
    value.profiles.some((profile) => profile.modelKey === key),
  );
  const profile = family?.profiles.find((value) => value.modelKey === key);
  const startEnd =
    Boolean(
      family?.spec.firstFrameField &&
        family.spec.lastFrameField &&
        profile?.references.nativeFields.includes(
          family.spec.firstFrameField,
        ) &&
        profile.references.nativeFields.includes(family.spec.lastFrameField),
    ) || key === MINIMAX_H3_CAPABILITY_PROFILE.modelKey;
  return {
    registry: registry
      ? {
          compilerId: registry.compilerId,
          compilerVersion: registry.compilerVersion,
          profileId: registry.profileId,
          profileVersion: registry.profileVersion,
        }
      : null,
    spec: family?.spec ?? null,
    profile:
      profile ??
      (key === MINIMAX_H3_CAPABILITY_PROFILE.modelKey
        ? MINIMAX_H3_CAPABILITY_PROFILE
        : null),
    startEnd,
  };
}

export function storyboardCatalogCapability(model: ModelDocument): {
  capability: StoryboardVideoModelCapability | null;
  reason: CapabilityReason | null;
} {
  const document: IModel = {
    id: model.id,
    key: model.key,
    label: model.label,
    category: ModelCategory.VIDEO,
    provider: model.provider as ModelProvider,
    lifecycle: model.lifecycle as ModelLifecycle,
    cost: model.cost,
    isActive: model.isActive,
    isDefault: model.isDefault,
    isDeleted: model.isDeleted,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
    maxOutputs: model.maxOutputs ?? undefined,
    maxReferences: model.maxReferences ?? undefined,
    aspectRatios: model.aspectRatios ?? undefined,
    defaultAspectRatio: model.defaultAspectRatio ?? undefined,
    durations: model.durations ?? undefined,
    defaultDuration: model.defaultDuration ?? undefined,
    hasInterpolation: model.hasInterpolation ?? undefined,
    hasEndFrame: model.hasEndFrame ?? undefined,
  };
  const resolved = getModelCapability(document);
  if (!resolved || resolved.category !== ModelCategory.VIDEO)
    return { capability: null, reason: 'MODEL_CAPABILITIES_UNAVAILABLE' };
  // A catalog empty/false value overrides static fallback, even for legacy rows without maxOutputs.
  const capability = {
    ...resolved,
    ...(model.durations != null ? { durations: model.durations } : {}),
    ...(model.hasInterpolation != null
      ? { hasInterpolation: model.hasInterpolation }
      : {}),
    ...(model.aspectRatios != null ? { aspectRatios: model.aspectRatios } : {}),
    ...(model.defaultDuration != null
      ? { defaultDuration: model.defaultDuration }
      : {}),
  };
  const durations = [...new Set(getModelDurations(model.key, capability))]
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 60)
    .sort((a, b) => a - b);
  if (!durations.length)
    return { capability: null, reason: 'MODEL_DURATIONS_UNAVAILABLE' };
  const defaultDuration = getModelDefaultDuration(model.key, capability);
  return {
    reason: null,
    capability: {
      key: model.key,
      label: model.label ?? model.key,
      provider: String(model.provider),
      supportedDurationsSeconds: durations,
      defaultDurationSeconds:
        defaultDuration !== undefined && durations.includes(defaultDuration)
          ? defaultDuration
          : null,
      hasInterpolation:
        hasInterpolation(model.key, capability) &&
        storyboardProviderMapping(model.key).startEnd,
      supportedFormats: (capability.aspectRatios ?? []).filter(
        (format): format is '9:16' | '16:9' | '1:1' | '4:5' =>
          ['9:16', '16:9', '1:1', '4:5'].includes(format),
      ),
      capabilitySource:
        model.maxOutputs != null ||
        model.durations != null ||
        model.aspectRatios != null ||
        model.hasInterpolation != null
          ? 'catalog'
          : 'registry',
    },
  };
}

@Injectable()
export class StoryboardRunCapabilitiesService {
  constructor(
    private readonly store: StoryboardRunStoreService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly settings: OrganizationSettingsService,
    private readonly models: ModelsService,
    private readonly router: RouterService,
  ) {}

  async get(
    organizationId: string,
    brandId: string,
    runId: string,
  ): Promise<StoryboardRunCapabilities> {
    const { config } = await this.store.read(organizationId, brandId, runId);
    return this.resolve(organizationId, brandId, runId, config);
  }

  async resolve(
    organizationId: string,
    brandId: string,
    runId: string,
    config: StoryboardRunConfig,
  ): Promise<StoryboardRunCapabilities> {
    const [context, settings, catalog] = await Promise.all([
      this.planning.resolveBrandContext(organizationId, brandId),
      this.settings.findOne({ organizationId }),
      this.models.findAllActive({
        category: ModelCategory.VIDEO,
        isDeleted: false,
        OR: [{ organizationId }, { organizationId: null }],
      }),
    ]);
    const enabled = settings?.enabledModelIds ?? [];
    const requestedModelKey = config.plan.videoModelKey ?? null;
    const visible = catalog.filter(
      (model) =>
        !model.organizationId || model.organizationId === organizationId,
    );
    const eligibleModels = visible
      .filter(
        (model) =>
          model.isActive &&
          model.lifecycle !== ModelLifecycle.RETIRED &&
          (!model.isDiscovered || model.reviewStatus === 'approved') &&
          isModelOnAllowlist(model, enabled),
      )
      .flatMap((model) => {
        const capability = storyboardCatalogCapability(model).capability;
        return capability?.supportedFormats.includes(config.plan.format)
          ? [capability]
          : [];
      })
      .sort((a, b) => a.key.localeCompare(b.key));
    let key = requestedModelKey;
    let reasonCode: CapabilityReason | null = null;
    let selected: ModelDocument | null = null;
    if (key) {
      selected =
        (await this.models.findOne({
          key,
          organizationId,
          isDeleted: false,
        })) ??
        (await this.models.findOne({
          key,
          organizationId: null,
          isDeleted: false,
        }));
      if (!selected || selected.category !== ModelCategory.VIDEO)
        reasonCode = 'MODEL_UNAVAILABLE';
      else if (selected.lifecycle === ModelLifecycle.RETIRED)
        reasonCode = 'MODEL_RETIRED';
      else if (!selected.isActive || !isModelOnAllowlist(selected, enabled))
        reasonCode = 'MODEL_DISABLED';
      else if (selected.isDiscovered && selected.reviewStatus !== 'approved')
        reasonCode = 'MODEL_UNAVAILABLE';
    } else if (eligibleModels.length) {
      const defaults = [
        context.brand.defaultVideoModel,
        settings?.defaultVideoModel,
      ];
      try {
        const resolution = await this.router.resolveModelKey({
          category: ModelCategory.VIDEO,
          organizationId,
          candidates: defaults,
          eligibleModelKeys: eligibleModels.map((model) => model.key),
        });
        key = resolution.key;
      } catch (error: unknown) {
        if (!(error instanceof NotFoundException)) throw error;
        reasonCode = 'NO_ELIGIBLE_VIDEO_MODEL';
      }
      selected = visible.find((model) => model.key === key) ?? null;
    } else reasonCode = 'NO_ELIGIBLE_VIDEO_MODEL';
    const result =
      selected && !reasonCode ? storyboardCatalogCapability(selected) : null;
    if (result?.reason) reasonCode = result.reason;
    const effectiveModel = result?.capability ?? null;
    if (
      effectiveModel &&
      !effectiveModel.supportedFormats.includes(config.plan.format)
    )
      reasonCode = 'FORMAT_UNSUPPORTED';
    const capabilityVersion = createHash('sha256')
      .update(
        canonical({
          organizationId,
          brandId,
          runId,
          requestedModelKey,
          effectiveKey: key,
          format: config.plan.format,
          eligibleModels,
          effectiveModel,
          reasonCode,
          enabled: [...enabled].sort(),
          catalog: visible
            .map((model) => ({
              key: model.key,
              id: model.id,
              isActive: model.isActive,
              lifecycle: model.lifecycle,
              isDefault: model.isDefault,
              qualityTier: model.qualityTier,
              costTier: model.costTier,
              isHighlighted: model.isHighlighted,
              mapping: storyboardProviderMapping(model.key),
              capabilities: storyboardCatalogCapability(model),
            }))
            .sort((a, b) => a.key.localeCompare(b.key)),
        }),
      )
      .digest('hex');
    return storyboardRunCapabilitiesSchema.parse({
      version: 1,
      runId,
      runRevision: config.revision,
      capabilityVersion,
      status: effectiveModel && !reasonCode ? 'available' : 'unavailable',
      requestedModelKey,
      effectiveModel,
      eligibleModels,
      reasonCode:
        reasonCode ?? (effectiveModel ? null : 'NO_ELIGIBLE_VIDEO_MODEL'),
    });
  }
}
