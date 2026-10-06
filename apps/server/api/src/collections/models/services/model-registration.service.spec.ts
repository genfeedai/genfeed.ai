import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { findUnpriceableModelIds } from '@api/collections/models/utils/model-pricing-attention.util';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';

vi.mock('@api/collections/models/utils/model-pricing-attention.util', () => ({
  findUnpriceableModelIds: vi.fn(),
  unpriceableModelsScope: vi.fn(() => ({ isDeleted: false })),
}));

const organizationId = testId('org');
const modelId = testId('model');
const modelKey = 'black-forest-labs/flux-1.1-pro';

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    id: modelId,
    isActive: true,
    isDeleted: false,
    key: modelKey,
    lifecycle: ModelLifecycle.AVAILABLE,
    organizationId: null,
    ...overrides,
  };
}

function makeService() {
  const modelsService = {
    findOne: vi.fn(),
  };
  const orgSettingsService = {
    ensureEnabledModelIds: vi.fn(),
    findOne: vi.fn(),
  };
  const service = new ModelRegistrationService(
    {} as PrismaService,
    orgSettingsService as unknown as OrganizationSettingsService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
    modelsService as unknown as ModelsService,
  );

  return { modelsService, orgSettingsService, service };
}

describe('ModelRegistrationService.validateModelForOrg', () => {
  it('seeds an empty allowlist and allows a model that the seed enables', async () => {
    const { modelsService, orgSettingsService, service } = makeService();
    const emptySettings = {
      enabledModelIds: [],
      id: testId('setting'),
      organizationId,
    };
    const seededSettings = {
      ...emptySettings,
      enabledModelIds: [modelId, testId('model', 2)],
    };
    const model = makeModel();

    modelsService.findOne.mockResolvedValue(model);
    orgSettingsService.findOne.mockResolvedValue(emptySettings);
    orgSettingsService.ensureEnabledModelIds.mockResolvedValue(seededSettings);

    await expect(
      service.validateModelForOrg(modelKey, organizationId),
    ).resolves.toEqual(model);

    expect(orgSettingsService.ensureEnabledModelIds).toHaveBeenCalledWith(
      emptySettings,
    );
  });

  it('still 403s when an empty allowlist stays empty after seed', async () => {
    const { modelsService, orgSettingsService, service } = makeService();
    const emptySettings = {
      enabledModelIds: [],
      id: testId('setting'),
      organizationId,
    };

    modelsService.findOne.mockResolvedValue(makeModel());
    orgSettingsService.findOne.mockResolvedValue(emptySettings);
    orgSettingsService.ensureEnabledModelIds.mockResolvedValue(emptySettings);

    await expect(
      service.validateModelForOrg(modelKey, organizationId),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.validateModelForOrg(modelKey, organizationId),
    ).rejects.toThrow('No models enabled for this workspace');

    expect(orgSettingsService.ensureEnabledModelIds).toHaveBeenCalledWith(
      emptySettings,
    );
  });

  it('does not rewrite a non-empty allowlist and 403s models outside it', async () => {
    const { modelsService, orgSettingsService, service } = makeService();
    const explicitSettings = {
      enabledModelIds: [testId('model', 9)],
      id: testId('setting'),
      organizationId,
    };

    modelsService.findOne.mockResolvedValue(makeModel());
    orgSettingsService.findOne.mockResolvedValue(explicitSettings);
    orgSettingsService.ensureEnabledModelIds.mockImplementation(
      (setting: typeof explicitSettings) => Promise.resolve(setting),
    );

    await expect(
      service.validateModelForOrg(modelKey, organizationId),
    ).rejects.toThrow('Model not enabled for this organization');

    expect(orgSettingsService.ensureEnabledModelIds).toHaveBeenCalledWith(
      explicitSettings,
    );
    await expect(
      orgSettingsService.ensureEnabledModelIds.mock.results[0]?.value,
    ).resolves.toBe(explicitSettings);
  });

  it('allows a model when the allowlist stores its key instead of its id', async () => {
    const { modelsService, orgSettingsService, service } = makeService();
    const keyedSettings = {
      enabledModelIds: [modelKey],
      id: testId('setting'),
      organizationId,
    };
    const model = makeModel();

    modelsService.findOne.mockResolvedValue(model);
    orgSettingsService.findOne.mockResolvedValue(keyedSettings);
    orgSettingsService.ensureEnabledModelIds.mockImplementation(
      (setting: typeof keyedSettings) => Promise.resolve(setting),
    );

    await expect(
      service.validateModelForOrg(modelKey, organizationId),
    ).resolves.toEqual(model);
  });

  it('resolves an allowlisted global Retired alias to its global successor', async () => {
    const { modelsService, orgSettingsService, service } = makeService();
    const successorKey = 'black-forest-labs/flux-2-pro';
    const retired = makeModel({
      isActive: false,
      lifecycle: ModelLifecycle.RETIRED,
      succeededBy: successorKey,
    });
    const successor = makeModel({
      id: testId('model', 2),
      key: successorKey,
      lifecycle: ModelLifecycle.RECOMMENDED,
    });
    modelsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(retired)
      .mockResolvedValueOnce(successor);
    orgSettingsService.findOne.mockResolvedValue({
      enabledModelIds: [modelId],
      id: testId('setting'),
      organizationId,
    });
    orgSettingsService.ensureEnabledModelIds.mockImplementation((settings) =>
      Promise.resolve(settings),
    );

    await expect(
      service.validateModelForOrg(modelKey, organizationId),
    ).resolves.toEqual(successor);
    expect(modelsService.findOne).toHaveBeenNthCalledWith(3, {
      key: successorKey,
      organizationId: null,
    });
  });
});

describe('ModelRegistrationService.listCallableGenerationModels', () => {
  const schnellKey = 'black-forest-labs/flux-schnell';

  function makeListService() {
    const findMany = vi.fn();
    const orgSettingsService = {
      ensureEnabledModelIds: vi.fn((settings: unknown) =>
        Promise.resolve(settings),
      ),
      findOne: vi.fn(),
    };
    const service = new ModelRegistrationService(
      { model: { findMany } } as unknown as PrismaService,
      orgSettingsService as unknown as OrganizationSettingsService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      { findOne: vi.fn() } as unknown as ModelsService,
    );
    return { findMany, orgSettingsService, service };
  }

  it('returns no keys and does not query when the allowlist is empty', async () => {
    const { findMany, orgSettingsService, service } = makeListService();
    vi.mocked(findUnpriceableModelIds).mockClear();
    orgSettingsService.findOne.mockResolvedValue({
      enabledModelIds: [],
      id: testId('setting'),
      organizationId,
    });

    await expect(
      service.listCallableGenerationModels(organizationId),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnpriceableModelIds).not.toHaveBeenCalled();
  });

  it('returns allowlisted catalog keys and hides aliases that are not stored', async () => {
    const { findMany, orgSettingsService, service } = makeListService();
    vi.mocked(findUnpriceableModelIds).mockResolvedValue(['red-model']);
    orgSettingsService.findOne.mockResolvedValue({
      enabledModelIds: [modelId, schnellKey],
      id: testId('setting'),
      organizationId,
    });
    findMany.mockResolvedValue([
      {
        category: 'image',
        id: modelId,
        key: schnellKey,
        label: 'FLUX.1 Schnell',
      },
      {
        category: 'image',
        id: 'other',
        key: 'fal-ai/flux/schnell',
        label: 'fal Schnell',
      },
      {
        category: 'image',
        id: 'blank',
        key: '   ',
        label: 'Blank',
      },
      {
        category: 'text',
        id: 'text-model',
        key: 'openrouter/text',
        label: 'Text',
      },
    ]);

    await expect(
      service.listCallableGenerationModels(organizationId),
    ).resolves.toEqual([
      {
        key: schnellKey,
        label: 'FLUX.1 Schnell',
        type: 'image',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: {
            in: ['image', 'image-edit', 'video', 'voice', 'music'],
          },
          isActive: true,
          isDeleted: false,
          lifecycle: { not: ModelLifecycle.RETIRED },
          id: { notIn: ['red-model'] },
        }),
      }),
    );
  });

  it('limits the catalog to the requested generation type', async () => {
    const { findMany, orgSettingsService, service } = makeListService();
    vi.mocked(findUnpriceableModelIds).mockResolvedValue([]);
    orgSettingsService.findOne.mockResolvedValue({
      enabledModelIds: ['video-model'],
      id: testId('setting'),
      organizationId,
    });
    findMany.mockResolvedValue([
      {
        category: 'video',
        id: 'video-model',
        key: 'kwaivgi/kling-v3-video',
        label: ' Kling ',
      },
    ]);

    await expect(
      service.listCallableGenerationModels(organizationId, 'video'),
    ).resolves.toEqual([
      {
        key: 'kwaivgi/kling-v3-video',
        label: 'Kling',
        type: 'video',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { in: ['video'] },
        }),
      }),
    );
  });
});
