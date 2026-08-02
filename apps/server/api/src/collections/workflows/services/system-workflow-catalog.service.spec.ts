import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SystemWorkflowCatalogService', () => {
  const workflow = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    workflow,
  };
  const logger: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const workflowExecutionQueueService = {
    syncWorkflowScheduler: vi.fn(),
  };

  let service: SystemWorkflowCatalogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SystemWorkflowCatalogService(
      prisma as never,
      logger as LoggerService,
      workflowExecutionQueueService as never,
    );
  });

  it('lists catalog entries with install status for the organization', async () => {
    workflow.findMany.mockResolvedValueOnce([
      {
        id: 'wf-1',
        metadata: { sourceTemplateId: 'daily-trends-digest' },
      },
    ]);

    const items = await service.listCatalogForOrganization('org-1');
    const digest = items.find(
      (item) => item.canonicalId === 'daily-trends-digest',
    );
    const missing = items.find(
      (item) => item.canonicalId === 'ad-optimization',
    );

    expect(digest).toMatchObject({
      installed: true,
      installedWorkflowId: 'wf-1',
      installable: true,
    });
    expect(missing).toMatchObject({
      installed: false,
      installedWorkflowId: null,
    });
  });

  it('is idempotent when the catalog template is already installed and re-syncs the scheduler', async () => {
    workflow.findFirst.mockResolvedValueOnce({
      id: 'existing-wf',
      isDeleted: false,
      isScheduleEnabled: true,
      metadata: { sourceTemplateId: 'daily-trends-digest' },
      schedule: '0 7 * * *',
      status: 'active',
      timezone: 'UTC',
    });

    const result = await service.install({
      canonicalId: 'daily-trends-digest',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ id: 'existing-wf' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Idempotent retries must re-sync so a prior post-commit scheduler failure
    // can recover without creating a duplicate install (#2259).
    expect(
      workflowExecutionQueueService.syncWorkflowScheduler,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing-wf',
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
      }),
    );
  });

  it('does not report soft-deleted installs as active', async () => {
    // scopedWhere injects isDeleted: false, so soft-deleted rows never reach
    // the installed map. Assert the service treats an empty active set correctly.
    workflow.findMany.mockResolvedValueOnce([]);

    const items = await service.listCatalogForOrganization('org-1');
    const digest = items.find(
      (item) => item.canonicalId === 'daily-trends-digest',
    );

    expect(digest).toMatchObject({
      installed: false,
      installedWorkflowId: null,
    });
    expect(workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('creates a new install when only a soft-deleted row previously existed', async () => {
    // findExistingInstall uses scopedWhere → isDeleted: false, so a deleted
    // prior install is invisible and install proceeds to create.
    workflow.findFirst.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          workflow: {
            create: vi.fn().mockResolvedValue({
              id: 'reactivated-wf',
              isDeleted: false,
              isScheduleEnabled: true,
              metadata: { sourceTemplateId: 'daily-trends-digest' },
              schedule: '0 7 * * *',
              status: 'active',
              timezone: 'UTC',
            }),
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      },
    );

    const result = await service.install({
      canonicalId: 'daily-trends-digest',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ id: 'reactivated-wf' });
    expect(workflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('installs an editable tenant workflow from the catalog', async () => {
    workflow.findFirst.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          workflow: {
            create: vi.fn().mockResolvedValue({
              id: 'new-wf',
              isDeleted: false,
              isScheduleEnabled: true,
              metadata: { sourceTemplateId: 'daily-trends-digest' },
              schedule: '0 7 * * *',
              status: 'active',
              timezone: 'UTC',
            }),
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      },
    );

    const result = await service.install({
      brandId: 'brand-1',
      canonicalId: 'daily-trends-digest',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ id: 'new-wf' });
    expect(
      workflowExecutionQueueService.syncWorkflowScheduler,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-wf',
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
      }),
    );
  });

  it('returns the installed workflow when scheduler sync throws after commit', async () => {
    workflow.findFirst.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          workflow: {
            create: vi.fn().mockResolvedValue({
              id: 'new-wf',
              isDeleted: false,
              isScheduleEnabled: true,
              metadata: { sourceTemplateId: 'daily-trends-digest' },
              schedule: '0 7 * * *',
              status: 'active',
              timezone: 'UTC',
            }),
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      },
    );
    workflowExecutionQueueService.syncWorkflowScheduler.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    const result = await service.install({
      canonicalId: 'daily-trends-digest',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ id: 'new-wf' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('rejects install of non-installable system action catalog entries', async () => {
    await expect(
      service.install({
        canonicalId: 'scheduled-post-publishing',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/not user-installable/i);

    expect(workflow.findFirst).not.toHaveBeenCalled();
  });

  it('rejects unknown catalog ids', async () => {
    await expect(
      service.install({
        canonicalId: 'not-a-real-template',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/not found|catalog entry/i);
  });
});
