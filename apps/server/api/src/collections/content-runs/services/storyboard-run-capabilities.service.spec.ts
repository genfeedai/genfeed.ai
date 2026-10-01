import type { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import {
  StoryboardRunCapabilitiesService,
  storyboardCatalogCapability,
} from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import type { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { RouterService } from '@api/services/router/router.service';
import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

function model(patch: Record<string, unknown> = {}): ModelDocument {
  return {
    id: 'model-1',
    key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    label: 'Catalog video',
    category: ModelCategory.VIDEO,
    provider: 'replicate',
    lifecycle: ModelLifecycle.RECOMMENDED,
    isActive: true,
    isDefault: true,
    isDeleted: false,
    maxOutputs: 1,
    durations: [6, 4, 6],
    defaultDuration: 4,
    hasInterpolation: false,
    aspectRatios: ['9:16'],
    cost: 1,
    organizationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  } as unknown as ModelDocument;
}
function setup(requested: string | null = null) {
  const catalogModel = model();
  const config = {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    state: 'storyboard',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'A product' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
    plan: {
      videoModelKey: requested,
      title: '',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: 12,
      styleReferenceAssetIds: [],
      cast: [],
      shots: [],
    },
  } as StoryboardNativeRunConfig;
  const store = { read: vi.fn(async () => ({ config })) };
  const planning = {
    resolveBrandContext: vi.fn(async () => ({
      brand: { defaultVideoModel: catalogModel.key },
    })),
  };
  const settings = {
    findOne: vi.fn(async () => ({
      enabledModelIds: [catalogModel.key],
      defaultVideoModel: catalogModel.key,
    })),
  };
  const models = {
    findAllActive: vi.fn(async () => [catalogModel]),
    findOne: vi.fn(async () => catalogModel),
  };
  const router = {
    resolveModelKey: vi.fn(async () => ({
      key: catalogModel.key,
      source: 'candidate',
    })),
  };
  const service = new StoryboardRunCapabilitiesService(
    store as unknown as StoryboardRunStoreService,
    planning as unknown as BrandRemixRunPlanningService,
    settings as unknown as OrganizationSettingsService,
    models as unknown as ModelsService,
    router as unknown as RouterService,
  );
  return { service, store, settings, models, router, config, catalogModel };
}
describe('Read-only Storyboard model capabilities', () => {
  it('returns DB durations/default/false overrides and stable hashes without writes', async () => {
    const { service, router } = setup();
    const first = await service.get('org-1', 'brand-1', 'run-1');
    const second = await service.get('org-1', 'brand-1', 'run-1');
    expect(first).toEqual(second);
    expect(first.effectiveModel).toMatchObject({
      supportedDurationsSeconds: [4, 6],
      defaultDurationSeconds: 4,
      hasInterpolation: false,
      capabilitySource: 'catalog',
    });
    expect(router.resolveModelKey).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        eligibleModelKeys: [first.effectiveModel?.key],
      }),
    );
  });
  it('does not fall back to registry durations when the catalog explicitly has none', async () => {
    const { service, catalogModel } = setup(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    );
    catalogModel.durations = [];
    const result = await service.get('org-1', 'brand-1', 'run-1');
    expect(result.reasonCode).toBe('MODEL_DURATIONS_UNAVAILABLE');
    expect(result.status).toBe('unavailable');
  });
  it('retired explicit keys do not invoke successor routing', async () => {
    const { service, catalogModel, router } = setup(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    );
    catalogModel.lifecycle = ModelLifecycle.RETIRED;
    catalogModel.succeededBy = 'successor';
    const result = await service.get('org-1', 'brand-1', 'run-1');
    expect(result.reasonCode).toBe('MODEL_RETIRED');
    expect(router.resolveModelKey).not.toHaveBeenCalled();
  });
  it('unknown explicit keys and disabled allowlists fail closed', async () => {
    const unknown = setup('missing/video');
    unknown.models.findOne.mockResolvedValue(null as unknown as ModelDocument);
    expect(
      (await unknown.service.get('org-1', 'brand-1', 'run-1')).reasonCode,
    ).toBe('MODEL_UNAVAILABLE');
    const disabled = setup(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1);
    disabled.settings.findOne.mockResolvedValue({
      enabledModelIds: [],
      defaultVideoModel: disabled.catalogModel.key,
    });
    expect(
      (await disabled.service.get('org-1', 'brand-1', 'run-1')).reasonCode,
    ).toBe('MODEL_DISABLED');
  });
  it('requires both exact provider preparation fields before advertising interpolation', () => {
    const value = model({
      key: 'private/custom-video',
      hasInterpolation: true,
    });
    expect(
      storyboardCatalogCapability(value).capability?.hasInterpolation,
    ).toBe(false);
  });
  it('rejects unsupported formats and changes capability hashes for relevant catalog changes', async () => {
    const { service, catalogModel } = setup(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    );
    const first = await service.get('org-1', 'brand-1', 'run-1');
    catalogModel.aspectRatios = ['16:9'];
    const second = await service.get('org-1', 'brand-1', 'run-1');
    expect(second.reasonCode).toBe('FORMAT_UNSUPPORTED');
    expect(second.capabilityVersion).not.toBe(first.capabilityVersion);
  });
  it('reads the scoped run before consulting org-visible catalog rows', async () => {
    const { service, store, models } = setup();
    await service.get('org-1', 'brand-1', 'run-1');
    expect(store.read).toHaveBeenCalledWith('org-1', 'brand-1', 'run-1');
    expect(models.findAllActive).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        OR: [{ organizationId: 'org-1' }, { organizationId: null }],
      }),
    );
  });
});
