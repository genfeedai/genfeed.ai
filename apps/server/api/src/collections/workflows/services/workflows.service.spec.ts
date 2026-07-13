import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { buildSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import { WorkflowStatus, WorkflowStepStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    );
    vi.spyOn(service, 'create').mockResolvedValue({
      _id: { toString: () => 'workflow-1' },
      id: 'workflow-1',
      label: 'Workflow: release-loop',
      metadata: {},
      nodes: [],
      steps: [],
    } as never);
    vi.spyOn(service, 'executeWorkflowCompat').mockResolvedValue({
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
      steps?: Array<{ id: string; status: WorkflowStepStatus }>;
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
      expect.arrayContaining(['llm', 'reviewGate', 'workflow-output']),
    );
    expect(createInput.steps?.map((step) => step.status)).toEqual([
      WorkflowStepStatus.PENDING,
      WorkflowStepStatus.PENDING,
    ]);
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

  it('drops non-column create fields before delegating to Prisma', async () => {
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
    expect(createInput.trigger).toBeUndefined();
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

    expect(service.executeWorkflowCompat).not.toHaveBeenCalled();
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

    expect(service.executeWorkflowCompat).toHaveBeenCalledWith(
      'workflow-1',
      'user-1',
      'org-1',
      { titleText: 'My video title' },
    );
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
        organization: 'org-1',
        user: 'user-1',
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
      undefined,
      undefined,
      workflowExecutionQueueService as never,
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
      _id: 'system-workflow-1',
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
      organization: 'org-1',
      brandId: 'source-brand',
      schedule: '0 7 * * *',
      steps: [],
      user: 'owner-user',
    } as never);
    vi.spyOn(service, 'create').mockResolvedValue({
      _id: 'copy-workflow-1',
      id: 'copy-workflow-1',
      label: 'Daily Trends Digest (Copy)',
      metadata: {},
      nodes: [],
      steps: [],
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
      _id: 'workflow-1',
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
      organization: 'org-1',
      schedule: '0 9 * * *',
      steps: [],
      user: 'owner-user',
    } as never);
    vi.spyOn(service, 'create').mockResolvedValue({
      _id: 'copy-workflow-1',
      id: 'copy-workflow-1',
      label: 'Launch Workflow (Copy)',
      metadata: {},
      nodes: [],
      steps: [],
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
    expect(createInput.mongoId).toBeUndefined();
    expect(createInput.organization).toBeUndefined();
    expect(createInput.user).toBeUndefined();
  });

  it('rejects clone target brands outside the authenticated organization', async () => {
    vi.spyOn(service, 'findVisibleOrThrow').mockResolvedValue({
      brandId: 'source-brand',
      edges: [],
      id: 'workflow-1',
      inputVariables: [],
      label: 'Launch Workflow',
      nodes: [],
      steps: [],
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
    service = new WorkflowsService({} as never, logger as never);
  });

  it('guards ownership, flips isPublic/isTemplate, and returns the updated entity', async () => {
    vi.spyOn(service, 'findMutableOwnedOrThrow').mockResolvedValue({
      edges: [],
      name: 'My Workflow',
      nodes: [],
    } as never);
    vi.spyOn(service, 'patch').mockResolvedValue({
      _id: 'workflow-1',
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
      organization: 'org-1',
      user: 'user-1',
    });
    expect(service.patch).toHaveBeenCalledWith('workflow-1', {
      isPublic: true,
      isTemplate: true,
    });
    expect(result).toBeInstanceOf(WorkflowEntity);
    expect(result.id).toBe('workflow-1');
  });
});
