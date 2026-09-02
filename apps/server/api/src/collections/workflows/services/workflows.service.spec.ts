import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { buildSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import { SYSTEM_WORKFLOW_CATALOG } from '@api/collections/workflows/workflows.tokens';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const emptyModuleRef = { get: vi.fn(() => undefined) };

describe('WorkflowsService template creation', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const brandFindFirst = vi.fn();

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });
    service = new WorkflowsService(
      { brand: { findFirst: brandFindFirst } } as never,
      logger as never,
      emptyModuleRef as never,
    );
    vi.spyOn(service, 'create').mockResolvedValue({
      id: 'workflow-1',
      label: 'Workflow: release-loop',
      metadata: {},
      nodes: [],
    } as never);
    vi.spyOn(service, 'executeWorkflow').mockResolvedValue({
      mode: 'node',
    });
  });

  it('copies productized routine metadata and schedule defaults from the selected template', async () => {
    await service.createWorkflow(
      'user-1',
      'org-1',
      {
        edges: [],
        metadata: {
          createdFrom: 'templates',
        },
        nodes: [],
        templateId: 'release-loop',
      } as never,
      'brand-1',
    );

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as {
      brandId?: string;
      isScheduleEnabled?: boolean;
      metadata?: Record<string, unknown>;
      nodes?: Array<{ id: string; type: string }>;
      organization?: string;
      organizationId?: string;
      schedule?: string;
      status?: WorkflowStatus;
      timezone?: string;
      user?: string;
      userId?: string;
    };

    expect(createInput).toMatchObject({
      brandId: 'brand-1',
      isScheduleEnabled: true,
      metadata: {
        createdFrom: 'templates',
        productizedRoutine: {
          kind: 'productized-daily-routine',
          outputDestinations: expect.arrayContaining([
            expect.objectContaining({ key: 'releaseAssets' }),
          ]),
          parentIssue: 224,
          reviewDefaults: expect.objectContaining({
            requireApproval: true,
            reviewState: 'pending_approval',
          }),
          sourceIssue: 976,
          trackingTasks: expect.arrayContaining([
            expect.objectContaining({ key: 'review-release-assets' }),
          ]),
        },
        sourceTemplateId: 'release-loop',
        sourceType: 'seeded-template',
      },
      schedule: '0 9 * * *',
      status: WorkflowStatus.ACTIVE,
      timezone: 'UTC',
    });
    expect(createInput.organizationId).toBe('org-1');
    expect(createInput.userId).toBe('user-1');
    expect(createInput.organization).toBeUndefined();
    expect(createInput.user).toBeUndefined();
    expect(createInput.nodes?.map((node) => node.type)).toEqual(
      expect.arrayContaining(['workflowInput', 'genfeedAction', 'reviewGate']),
    );
  });

  it('keeps caller schedule overrides while preserving routine metadata', async () => {
    await service.createWorkflow('user-1', 'org-1', {
      edges: [],
      isScheduleEnabled: false,
      nodes: [],
      schedule: '30 10 * * *',
      templateId: 'daily-trend-loop',
      timezone: 'Europe/Malta',
    } as never);

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as {
      isScheduleEnabled?: boolean;
      metadata?: Record<string, unknown>;
      schedule?: string;
      timezone?: string;
    };

    expect(createInput).toMatchObject({
      isScheduleEnabled: false,
      metadata: {
        productizedRoutine: expect.objectContaining({
          kind: 'productized-daily-routine',
          sourceIssue: 976,
        }),
        sourceTemplateId: 'daily-trend-loop',
      },
      schedule: '30 10 * * *',
      timezone: 'Europe/Malta',
    });
  });

  it('drops non-column create fields while preserving persisted trigger data', async () => {
    await service.createWorkflow(
      'user-1',
      'org-1',
      {
        edges: [],
        isPublic: true,
        isTemplate: true,
        label: 'Browser Workflow',
        nodes: [],
        scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
        sourceAsset: 'asset-1',
        templateId: 'custom-template',
        trigger: 'manual',
      } as never,
      'brand-1',
    );

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(createInput).toMatchObject({
      brandId: 'brand-1',
      edges: [],
      label: 'Browser Workflow',
      nodes: [],
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(createInput.isPublic).toBeUndefined();
    expect(createInput.isTemplate).toBeUndefined();
    expect(createInput.organization).toBeUndefined();
    expect(createInput.scheduledFor).toBeUndefined();
    expect(createInput.sourceAsset).toBeUndefined();
    expect(createInput.templateId).toBeUndefined();
    expect(createInput.trigger).toBe('manual');
    expect(createInput.user).toBeUndefined();
  });

  it('rejects workflow brands outside the authenticated organization', async () => {
    brandFindFirst.mockResolvedValue(null);

    await expect(
      service.createWorkflow('user-1', 'org-1', {
        brandId: 'foreign-brand',
        edges: [],
        nodes: [],
      } as never),
    ).rejects.toThrow('Brand is not available in this organization');

    expect(brandFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: 'foreign-brand',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('skips initial manual execution when required inputs do not have defaults', async () => {
    await service.createWorkflow('user-1', 'org-1', {
      edges: [],
      inputVariables: [
        {
          key: 'titleText',
          label: 'Title text',
          required: true,
          type: 'text',
        },
      ],
      nodes: [],
      trigger: 'manual',
    } as never);

    expect(service.executeWorkflow).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('titleText'),
    );
  });

  it('passes default inputs to initial manual execution', async () => {
    await service.createWorkflow('user-1', 'org-1', {
      edges: [],
      inputVariables: [
        {
          defaultValue: 'My video title',
          key: 'titleText',
          label: 'Title text',
          required: true,
          type: 'text',
        },
      ],
      nodes: [],
      trigger: 'manual',
    } as never);

    expect(service.executeWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      'user-1',
      'org-1',
      { titleText: 'My video title' },
    );
  });
});

describe('WorkflowsService executeWorkflow ModuleRef', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  it('runs a node workflow through ModuleRef WorkflowExecutorService', async () => {
    const executeManualWorkflow = vi.fn().mockResolvedValue({
      executionId: 'ex-1',
    });
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === WorkflowExecutorService) {
          return { executeManualWorkflow };
        }
        return undefined;
      }),
    };
    const service = new WorkflowsService(
      { brand: { findFirst: vi.fn() } } as never,
      logger as never,
      moduleRef as never,
    );
    vi.spyOn(service, 'findOne').mockResolvedValue({
      id: 'wf-1',
      nodes: [{ id: 'n1', type: 'llm' }],
    } as never);

    await expect(
      service.executeWorkflow('wf-1', 'user-1', 'org-1', { title: 'x' }),
    ).resolves.toEqual({ executionId: 'ex-1', mode: 'node' });
    expect(executeManualWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'user-1',
      'org-1',
      { title: 'x' },
      undefined,
      WorkflowExecutionTrigger.MANUAL,
    );
  });

  it('throws when ModuleRef cannot resolve the node executor', async () => {
    const service = new WorkflowsService(
      { brand: { findFirst: vi.fn() } } as never,
      logger as never,
      { get: vi.fn(() => undefined) } as never,
    );
    vi.spyOn(service, 'findOne').mockResolvedValue({
      id: 'wf-1',
      nodes: [{ id: 'n1', type: 'llm' }],
    } as never);

    await expect(
      service.executeWorkflow('wf-1', 'user-1', 'org-1'),
    ).rejects.toThrow(
      'Workflow executor service is not available - cannot execute node workflow',
    );
  });

  it('installs a system-catalog workflow through ModuleRef catalog', async () => {
    const install = vi.fn().mockResolvedValue({
      id: 'installed-1',
      label: 'Catalog',
      metadata: {},
    });
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === SYSTEM_WORKFLOW_CATALOG) {
          return { install };
        }
        return undefined;
      }),
    };
    const service = new WorkflowsService(
      {
        brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      } as never,
      logger as never,
      moduleRef as never,
    );

    const created = await service.createWorkflow(
      'user-1',
      'org-1',
      {
        sourceType: 'system-catalog',
        templateId: 'release-loop',
      } as never,
      'brand-1',
    );

    expect(install).toHaveBeenCalledWith({
      brandId: 'brand-1',
      canonicalId: 'release-loop',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(created.id).toBe('installed-1');
  });
});

describe('WorkflowsService system workflow guardrails', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const brandFindFirst = vi.fn();

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });
    service = new WorkflowsService(
      { brand: { findFirst: brandFindFirst } } as never,
      logger as never,
      emptyModuleRef as never,
    );
  });

  it('rejects mutable access to protected system workflows', async () => {
    vi.spyOn(service, 'findOwnedOrThrow').mockResolvedValue({
      metadata: {
        systemWorkflow: buildSystemWorkflowMetadata({
          canonicalId: 'daily-trends-digest',
          changeSummary: 'Initial daily digest version.',
          sourceIssue: 1011,
          version: 2,
        }),
      },
    } as never);

    await expect(
      service.findMutableOwnedOrThrow('workflow-1', {
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('System workflows are immutable');
  });

  it('rejects direct deletion of protected system workflows', async () => {
    const prisma = {
      workflow: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'system-workflow-1',
          isDeleted: false,
          metadata: {
            systemWorkflow: buildSystemWorkflowMetadata({
              canonicalId: 'daily-trends-digest',
              changeSummary: 'Initial daily digest version.',
              sourceIssue: 1011,
              version: 2,
            }),
          },
        }),
        update: vi.fn(),
      },
    };
    const workflowExecutionQueueService = {
      syncWorkflowScheduler: vi.fn(),
    };
    const guardedService = new WorkflowsService(
      prisma as never,
      logger as never,
      {
        get: vi.fn((token: unknown) =>
          token === WorkflowExecutionQueueService
            ? workflowExecutionQueueService
            : undefined,
        ),
      } as never,
    );

    await expect(guardedService.remove('system-workflow-1')).rejects.toThrow(
      'System workflows are immutable',
    );

    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(
      workflowExecutionQueueService.syncWorkflowScheduler,
    ).not.toHaveBeenCalled();
  });

  it('duplicates protected system workflows as editable user drafts', async () => {
    vi.spyOn(service, 'findVisibleOrThrow').mockResolvedValue({
      edges: [],
      id: 'system-workflow-1',
      inputVariables: [],
      isScheduleEnabled: true,
      label: 'Daily Trends Digest',
      lockedNodeIds: ['system-node'],
      metadata: {
        sourceTemplateId: 'daily-trends-digest',
        sourceType: 'seeded-template',
        systemWorkflow: buildSystemWorkflowMetadata({
          canonicalId: 'daily-trends-digest',
          changeSummary: 'Initial daily digest version.',
          sourceIssue: 1011,
          version: 2,
        }),
      },
      nodes: [],
      organizationId: 'org-1',
      brandId: 'source-brand',
      schedule: '0 7 * * *',
      userId: 'owner-user',
    } as never);
    vi.spyOn(service, 'create').mockResolvedValue({
      id: 'copy-workflow-1',
      label: 'Daily Trends Digest (Copy)',
      metadata: {},
      nodes: [],
    } as never);

    await service.cloneWorkflow(
      'system-workflow-1',
      'user-1',
      'org-1',
      'target-brand',
    );

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as {
      brandId?: string;
      isScheduleEnabled?: boolean;
      label?: string;
      lockedNodeIds?: string[];
      metadata?: Record<string, unknown>;
      schedule?: string;
      status?: WorkflowStatus;
    };

    expect(createInput).toMatchObject({
      brandId: 'target-brand',
      isScheduleEnabled: false,
      label: 'Daily Trends Digest (Copy)',
      lockedNodeIds: [],
      status: WorkflowStatus.DRAFT,
    });
    expect(createInput.schedule).toBeUndefined();
    expect(createInput.metadata?.systemWorkflow).toBeUndefined();
    expect(createInput.metadata?.duplicatedFromSystemWorkflow).toEqual(
      expect.objectContaining({
        canonicalId: 'daily-trends-digest',
        currentSystemWorkflowChangeSummary: 'Initial daily digest version.',
        currentSystemWorkflowVersion: 2,
        credentialPolicy: 'tenant-connected-account',
        sourceWorkflowChangeSummary: 'Initial daily digest version.',
        sourceWorkflowId: 'system-workflow-1',
        sourceWorkflowVersion: 2,
        upgradeEligible: false,
        upgradePolicy: 'manual',
        upgradeStatus: 'current',
      }),
    );
  });

  it('duplicates editable workflows into the target brand without carrying source ownership state', async () => {
    vi.spyOn(service, 'findVisibleOrThrow').mockResolvedValue({
      brandId: 'source-brand',
      edges: [],
      executionCount: 3,
      id: 'workflow-1',
      inputVariables: [],
      isScheduleEnabled: true,
      label: 'Launch Workflow',
      lockedNodeIds: ['review-node'],
      metadata: { createdFrom: 'user' },
      nodes: [],
      organizationId: 'org-1',
      schedule: '0 9 * * *',
      userId: 'owner-user',
    } as never);
    vi.spyOn(service, 'create').mockResolvedValue({
      id: 'copy-workflow-1',
      label: 'Launch Workflow (Copy)',
      metadata: {},
      nodes: [],
    } as never);

    await service.cloneWorkflow('workflow-1', 'user-1', 'org-1', 'brand-2');

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(createInput).toMatchObject({
      brandId: 'brand-2',
      defaultRecurringBrandId: 'brand-2',
      executionCount: 0,
      isScheduleEnabled: true,
      label: 'Launch Workflow (Copy)',
      lockedNodeIds: ['review-node'],
      organizationId: 'org-1',
      progress: 0,
      schedule: '0 9 * * *',
      status: WorkflowStatus.DRAFT,
      userId: 'user-1',
    });
    expect(createInput.id).toBeUndefined();
    expect(createInput.organization).toBeUndefined();
    expect(createInput.user).toBeUndefined();
  });

  it('prefers an explicit body brandId over the session brand when cloning via create', async () => {
    vi.spyOn(service, 'cloneWorkflow').mockResolvedValue({} as never);

    await service.createWorkflow(
      'user-1',
      'org-1',
      {
        brandId: 'body-brand',
        edges: [],
        nodes: [],
        sourceWorkflowId: 'workflow-1',
      } as never,
      'session-brand',
    );

    expect(service.cloneWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      'user-1',
      'org-1',
      'body-brand',
    );
  });

  it('falls back to the session brand when cloning via create without a body brandId', async () => {
    vi.spyOn(service, 'cloneWorkflow').mockResolvedValue({} as never);

    await service.createWorkflow(
      'user-1',
      'org-1',
      {
        edges: [],
        nodes: [],
        sourceWorkflowId: 'workflow-1',
      } as never,
      'session-brand',
    );

    expect(service.cloneWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      'user-1',
      'org-1',
      'session-brand',
    );
  });

  it('rejects clone target brands outside the authenticated organization', async () => {
    vi.spyOn(service, 'findVisibleOrThrow').mockResolvedValue({
      brandId: 'source-brand',
      edges: [],
      id: 'workflow-1',
      inputVariables: [],
      label: 'Launch Workflow',
      nodes: [],
    } as never);
    vi.spyOn(service, 'create').mockResolvedValue({} as never);
    brandFindFirst.mockResolvedValue(null);

    await expect(
      service.cloneWorkflow('workflow-1', 'user-1', 'org-1', 'foreign-brand'),
    ).rejects.toThrow('Brand is not available in this organization');

    expect(brandFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: 'foreign-brand',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(service.create).not.toHaveBeenCalled();
  });
});

describe('WorkflowsService.publishToMarketplace', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    // No marketplaceApiClient wired (it's @Optional()) — verifies the guard +
    // patch path runs standalone without requiring the marketplace client.
    service = new WorkflowsService(
      {} as never,
      logger as never,
      emptyModuleRef as never,
    );
  });

  it('guards ownership, flips isPublic/isTemplate, and returns the updated entity', async () => {
    vi.spyOn(service, 'findMutableOwnedOrThrow').mockResolvedValue({
      edges: [],
      name: 'My Workflow',
      nodes: [],
    } as never);
    vi.spyOn(service, 'patch').mockResolvedValue({
      id: 'workflow-1',
      isPublic: true,
      isTemplate: true,
      name: 'My Workflow',
    } as never);

    const result = await service.publishToMarketplace(
      'workflow-1',
      'user-1',
      'org-1',
    );

    expect(service.findMutableOwnedOrThrow).toHaveBeenCalledWith('workflow-1', {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(service.patch).toHaveBeenCalledWith('workflow-1', {
      isPublic: true,
      isTemplate: true,
    });
    expect(result).toBeInstanceOf(WorkflowEntity);
    expect(result.id).toBe('workflow-1');
  });
});
