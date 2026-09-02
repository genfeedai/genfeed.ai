import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';

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
