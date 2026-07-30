import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

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
    const service = new OrganizationSettingsService(
      { organizationSetting: {} } as never,
      {
        debug: () => undefined,
        error: () => undefined,
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      { get: () => undefined } as unknown as ModuleRef,
    );

    expect(service).toBeInstanceOf(OrganizationSettingsService);
  });
});
