import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

function makeService(): OrganizationSettingsService {
  return new OrganizationSettingsService(
    { organizationSetting: {} } as never,
    {
      debug: () => undefined,
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    } as unknown as LoggerService,
    { get: () => undefined } as unknown as ModuleRef,
  );
}

describe('OrganizationSettingsService system workflow bootstrap', () => {
  it('no longer clones system workflows on organization settings create (#2176)', () => {
    const source = readFileSync(
      resolve(__dirname, 'organization-settings.service.ts'),
      'utf8',
    );

    expect(source).not.toContain('provisionDefaultWorkflows');
    expect(source).not.toContain('WorkflowTemplateSeederService');
    expect(source).not.toContain('ensureDailyTrendsDigestWorkflow');
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
    vi.spyOn(service, 'getLatestMajorVersionModelIds').mockResolvedValue([
      'model_1',
      'model_2',
    ]);

    await service.ensureEnabledModelIds({
      enabledModelIds: [],
      id: 'set_1',
    } as never);

    expect(patch).toHaveBeenCalledWith('set_1', {
      enabledModelIds: ['model_1', 'model_2'],
    });
  });

  it('leaves a configured allowlist untouched so disabling a model sticks', async () => {
    const service = makeService();
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
});
