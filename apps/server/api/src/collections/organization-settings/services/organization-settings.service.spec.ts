import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

describe('OrganizationSettingsService.provisionDefaultWorkflows', () => {
  const organization = { findFirst: vi.fn() };
  const prisma = { organization, organizationSetting: {} };
  const logger: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const moduleRef = { get: vi.fn() };

  let service: OrganizationSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationSettingsService(
      prisma as never,
      logger as LoggerService,
      moduleRef as unknown as ModuleRef,
    );
  });

  // Private side-effect method; exercised directly to cover the bootstrap path.
  const provision = (settings: unknown) =>
    (
      service as unknown as {
        provisionDefaultWorkflows: (s: unknown) => Promise<void>;
      }
    ).provisionDefaultWorkflows(settings);

  it('reports to Sentry (and logs) instead of failing silently when provisioning throws', async () => {
    organization.findFirst.mockRejectedValueOnce(new Error('db down'));

    await expect(
      provision({ organizationId: 'org-1' }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('skips quietly when the organization has no owner userId', async () => {
    organization.findFirst.mockResolvedValueOnce({ userId: null });

    await provision({ organizationId: 'org-1' });

    expect(moduleRef.get).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('skips without a DB lookup when there is no organization id', async () => {
    await provision({});

    expect(organization.findFirst).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
