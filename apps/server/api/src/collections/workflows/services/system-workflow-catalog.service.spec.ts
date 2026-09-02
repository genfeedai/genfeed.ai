import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The shipped catalog no longer publishes non-installable system-action
 * entries — the action-graph hard cut removed that family. The service guard
 * is still a live contract for MCP and agent install callers, so it is proved
 * against a synthetic non-installable entry rather than a real canonical id.
 */
const NON_INSTALLABLE_CANONICAL_ID = 'test-only-non-installable';

vi.mock(
  '@api/collections/workflows/system-workflow-catalog',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@api/collections/workflows/system-workflow-catalog')
      >();

    return {
      ...actual,
      getSystemWorkflowCatalogEntry: (canonicalId: string) =>
        canonicalId === NON_INSTALLABLE_CANONICAL_ID
          ? {
              ...actual.listSystemWorkflowCatalog()[0],
              canonicalId: NON_INSTALLABLE_CANONICAL_ID,
              installable: false,
            }
          : actual.getSystemWorkflowCatalogEntry(canonicalId),
    };
  },
);

describe('SystemWorkflowCatalogService', () => {
  const workflow = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = {
    workflow,
  };
  const logger: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const workflowsService = {
    create: vi.fn(),
    findOne: vi.fn(),
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
      workflowsService as never,
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
    workflowsService.findOne.mockResolvedValueOnce({ id: 'existing-wf' });

    const result = await service.install({
      canonicalId: 'daily-trends-digest',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ id: 'existing-wf' });
    expect(workflowsService.create).not.toHaveBeenCalled();
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
    workflowsService.create.mockResolvedValueOnce({
      id: 'reactivated-wf',
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
    workflowsService.create.mockResolvedValueOnce({
      id: 'new-wf',
      isDeleted: false,
      isScheduleEnabled: true,
      metadata: { sourceTemplateId: 'daily-trends-digest' },
      schedule: '0 7 * * *',
      status: 'active',
      timezone: 'UTC',
    });

    const result = await service.install({
      brandId: 'brand-1',
      canonicalId: 'daily-trends-digest',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ id: 'new-wf' });
    expect(workflowsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    );
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
    workflowsService.create.mockResolvedValueOnce({
      id: 'new-wf',
      isDeleted: false,
      isScheduleEnabled: true,
      metadata: { sourceTemplateId: 'daily-trends-digest' },
      schedule: '0 7 * * *',
      status: 'active',
      timezone: 'UTC',
    });
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

  it('rejects install of non-installable catalog entries', async () => {
    await expect(
      service.install({
        canonicalId: NON_INSTALLABLE_CANONICAL_ID,
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/not user-installable/i);

    expect(workflow.findFirst).not.toHaveBeenCalled();
    expect(workflowsService.create).not.toHaveBeenCalled();
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
