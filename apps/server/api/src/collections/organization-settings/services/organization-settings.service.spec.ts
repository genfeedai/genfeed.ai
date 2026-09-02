import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isCloudDeployment: vi.fn(() => false),
  };
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { isCloudDeployment } from '@genfeedai/config';
import { Prisma } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';

function makePrismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('test database failure', {
    clientVersion: 'test',
    code,
  });
}

function makeService(
  nodeEnv = 'test',
  configGet?: ReturnType<typeof vi.fn>,
  modelsService: { findAllActive: ReturnType<typeof vi.fn> } = {
    findAllActive: vi.fn().mockResolvedValue([]),
  },
  organizationFindFirst: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockResolvedValue({ id: 'org_1' }),
): OrganizationSettingsService {
  const resolvedConfigGet =
    configGet ??
    vi.fn((key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined));
  return new OrganizationSettingsService(
    {
      organization: { findFirst: organizationFindFirst },
      organizationSetting: {},
    } as never,
    {
      debug: () => undefined,
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    } as unknown as LoggerService,
    { get: () => modelsService } as unknown as ModuleRef,
    { get: resolvedConfigGet } as unknown as ConfigService,
  );
}

afterEach(() => {
  vi.mocked(isCloudDeployment).mockReturnValue(false);
});

describe('OrganizationSettingsService system workflow bootstrap', () => {
  it('no longer clones system workflows on organization settings create (#2176)', () => {
    const source = readFileSync(
      resolve(__dirname, 'organization-settings.service.ts'),
      'utf8',
    );

    expect(source).not.toContain('provisionDefaultWorkflows');
    expect(source).not.toContain('WorkflowTemplateSeederService');
    expect(source).not.toContain('ensureDailyTrendsDigestWorkflow');
    expect(source).not.toContain('process.env.NODE_ENV');
  });

  it('constructs without requiring the workflow seeder', () => {
    expect(makeService()).toBeInstanceOf(OrganizationSettingsService);
  });
});

describe('OrganizationSettingsService.ensureEnabledModelIds', () => {
  it('seeds the allowlist when it is empty', async () => {
    const service = makeService();
    const patch = vi
      .spyOn(service, 'patch')
      .mockResolvedValue({ id: 'set_1' } as never);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'model_1',
      'model_2',
    ]);
    vi.spyOn(service, 'getLatestMajorVersionModelIds').mockResolvedValue([
      'model_cloud_1',
    ]);

    await service.ensureEnabledModelIds({
      enabledModelIds: [],
      id: 'set_1',
    } as never);

    expect(patch).toHaveBeenCalledWith('set_1', {
      enabledModelIds: ['model_1', 'model_2'],
    });
  });

  it('reads NODE_ENV from ConfigService instead of process.env', async () => {
    const configGet = vi.fn((key: string) =>
      key === 'NODE_ENV' ? 'production' : undefined,
    );
    const service = makeService('production', configGet);
    vi.spyOn(service, 'patch').mockResolvedValue({ id: 'set_1' } as never);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue(['cheap_1']);
    vi.spyOn(service, 'getLatestMajorVersionModelIds').mockResolvedValue([
      'quality_1',
    ]);

    await service.ensureEnabledModelIds({
      enabledModelIds: [],
      id: 'set_1',
    } as never);

    expect(configGet).toHaveBeenCalledWith('NODE_ENV');
  });

  it('leaves a configured allowlist untouched so disabling a model sticks', async () => {
    const service = makeService('test', undefined, {
      findAllActive: vi
        .fn()
        .mockResolvedValue([{ id: 'model_1', key: 'google/nano-banana' }]),
    });
    const patch = vi.spyOn(service, 'patch');
    const latest = vi.spyOn(service, 'getLatestMajorVersionModelIds');
    const setting = { enabledModelIds: ['model_1'], id: 'set_1' } as never;

    const result = await service.ensureEnabledModelIds(setting);

    // model_2 is deliberately disabled — re-adding it here would resurrect it
    // on every settings read and make the toggle impossible to switch off.
    expect(result).toBe(setting);
    expect(patch).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
  });

  it('re-seeds when every stored id is stale so all visible toggles are off', async () => {
    const service = makeService('test', undefined, {
      findAllActive: vi.fn().mockResolvedValue([]),
    });
    const patch = vi
      .spyOn(service, 'patch')
      .mockResolvedValue({ id: 'set_1' } as never);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'live_1',
      'live_2',
    ]);
    vi.spyOn(service, 'getLatestMajorVersionModelIds').mockResolvedValue([
      'cloud_1',
    ]);

    await service.ensureEnabledModelIds({
      enabledModelIds: ['dead_model'],
      id: 'set_1',
    } as never);

    expect(patch).toHaveBeenCalledWith('set_1', {
      enabledModelIds: ['live_1', 'live_2'],
    });
  });
});

describe('OrganizationSettingsService.ensureForOrganization', () => {
  it('rejects a missing or soft-deleted organization before reading or creating settings', async () => {
    const findActiveOrganization = vi.fn().mockResolvedValue(null);
    const service = makeService(
      'test',
      undefined,
      undefined,
      findActiveOrganization,
    );
    const findOne = vi.spyOn(service, 'findOne');
    const create = vi.spyOn(service, 'create');
    const lowestCost = vi.spyOn(service, 'getLowestCostModelIds');

    const failure = await service
      .ensureForOrganization('org_deleted')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotFoundException);
    expect(findActiveOrganization).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'org_deleted', isDeleted: false },
    });
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(lowestCost).not.toHaveBeenCalled();
  });

  it('returns existing settings without creating a row', async () => {
    const service = makeService();
    const existing = { enabledModelIds: ['model_1'], id: 'set_1' };
    const findOne = vi
      .spyOn(service, 'findOne')
      .mockResolvedValue(existing as never);
    vi.spyOn(service, 'ensureEnabledModelIds').mockResolvedValue(
      existing as never,
    );
    const create = vi.spyOn(service, 'create');

    const result = await service.ensureForOrganization('org_1');

    expect(result).toBe(existing);
    expect(findOne).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates once with lowest-cost defaults outside cloud production', async () => {
    const service = makeService();
    const created = {
      enabledModelIds: ['model_low_cost_1'],
      id: 'set_new',
    };
    const findOne = vi.spyOn(service, 'findOne').mockResolvedValue(null);
    const lowestCost = vi
      .spyOn(service, 'getLowestCostModelIds')
      .mockResolvedValue(['model_low_cost_1']);
    const latestMajor = vi
      .spyOn(service, 'getLatestMajorVersionModelIds')
      .mockResolvedValue(['model_quality_1']);
    const create = vi
      .spyOn(service, 'create')
      .mockResolvedValue(created as never);
    const ensureEnabledModelIds = vi.spyOn(service, 'ensureEnabledModelIds');
    const patch = vi.spyOn(service, 'patch');

    const result = await service.ensureForOrganization('org_1');

    expect(findOne).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(lowestCost).toHaveBeenCalledOnce();
    expect(latestMajor).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      brandsLimit: 0,
      enabledModelIds: ['model_low_cost_1'],
      isAutoEvaluateEnabled: false,
      isFastlaneEnabled: false,
      isGenerateArticlesEnabled: false,
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: true,
      isGenerateVideosEnabled: true,
      isNotificationsDiscordEnabled: false,
      isNotificationsEmailEnabled: true,
      isNotificationsTelegramEnabled: false,
      isVerifyIngredientEnabled: true,
      isVerifyScriptEnabled: true,
      isVerifyVideoEnabled: true,
      isVoiceControlEnabled: false,
      isWatermarkEnabled: true,
      isWebhookEnabled: false,
      isWhitelabelEnabled: false,
      organizationId: 'org_1',
      seatsLimit: 1,
      timezone: 'UTC',
    });
    expect(create).toHaveBeenCalledOnce();
    expect(ensureEnabledModelIds).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(result).toBe(created);
  });

  it('creates once with cloud production defaults', async () => {
    vi.mocked(isCloudDeployment).mockReturnValue(true);
    const service = makeService('production');
    const created = {
      enabledModelIds: ['model_quality_1'],
      id: 'set_new',
    };
    vi.spyOn(service, 'findOne').mockResolvedValue(null);
    const lowestCost = vi
      .spyOn(service, 'getLowestCostModelIds')
      .mockResolvedValue(['model_low_cost_1']);
    const latestMajor = vi
      .spyOn(service, 'getLatestMajorVersionModelIds')
      .mockResolvedValue(['model_quality_1']);
    const create = vi
      .spyOn(service, 'create')
      .mockResolvedValue(created as never);
    const ensureEnabledModelIds = vi.spyOn(service, 'ensureEnabledModelIds');
    const patch = vi.spyOn(service, 'patch');

    const result = await service.ensureForOrganization('org_1');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        enabledModelIds: ['model_quality_1'],
        isGenerateArticlesEnabled: false,
        organizationId: 'org_1',
      }),
    );
    expect(latestMajor).toHaveBeenCalledOnce();
    expect(lowestCost).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    expect(ensureEnabledModelIds).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(result).toBe(created);
  });

  it('re-reads after a unique constraint race', async () => {
    const service = makeService();
    const raced = { enabledModelIds: ['model_1'], id: 'set_raced' };
    const findOne = vi
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced as never);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'model_low_cost_1',
    ]);
    const create = vi
      .spyOn(service, 'create')
      .mockRejectedValue(makePrismaError('P2002'));
    vi.spyOn(service, 'ensureEnabledModelIds').mockResolvedValue(
      raced as never,
    );

    const result = await service.ensureForOrganization('org_1');

    expect(result).toBe(raced);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ enabledModelIds: ['model_low_cost_1'] }),
    );
    expect(findOne).toHaveBeenNthCalledWith(1, { organizationId: 'org_1' });
    expect(findOne).toHaveBeenNthCalledWith(2, { organizationId: 'org_1' });
  });

  it('rethrows non-P2002 create failures without a race re-read', async () => {
    const service = makeService();
    const failure = new Error('database unavailable');
    const findOne = vi.spyOn(service, 'findOne').mockResolvedValue(null);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'model_low_cost_1',
    ]);
    vi.spyOn(service, 'create').mockRejectedValue(failure);

    await expect(service.ensureForOrganization('org_1')).rejects.toBe(failure);

    expect(findOne).toHaveBeenCalledOnce();
  });

  it('rethrows null failures without masking the original rejection', async () => {
    const service = makeService();
    vi.spyOn(service, 'findOne').mockResolvedValue(null);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'model_low_cost_1',
    ]);
    vi.spyOn(service, 'create').mockRejectedValue(null);

    await expect(service.ensureForOrganization('org_1')).rejects.toBeNull();
  });

  it('maps a missing organization relation to the canonical 404', async () => {
    const service = makeService();
    vi.spyOn(service, 'findOne').mockResolvedValue(null);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'model_low_cost_1',
    ]);
    vi.spyOn(service, 'create').mockRejectedValue(makePrismaError('P2003'));

    const failure = await service
      .ensureForOrganization('org_missing')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotFoundException);
    expect((failure as NotFoundException).getStatus()).toBe(404);
    expect(failure).toHaveProperty(
      'message',
      "Organization with identifier 'org_missing' not found",
    );
  });

  it('rethrows P2002 when the winning row is still unavailable', async () => {
    const service = makeService();
    const conflict = makePrismaError('P2002');
    const findOne = vi.spyOn(service, 'findOne').mockResolvedValue(null);
    vi.spyOn(service, 'getLowestCostModelIds').mockResolvedValue([
      'model_low_cost_1',
    ]);
    vi.spyOn(service, 'create').mockRejectedValue(conflict);

    await expect(service.ensureForOrganization('org_1')).rejects.toBe(conflict);

    expect(findOne).toHaveBeenCalledTimes(2);
    expect(findOne).toHaveBeenNthCalledWith(2, { organizationId: 'org_1' });
  });
});
