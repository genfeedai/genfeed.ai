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

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowsService({} as never, logger as never);
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
    await service.createWorkflow('user-1', 'org-1', {
      edges: [],
      metadata: {
        createdFrom: 'templates',
      },
      nodes: [],
      templateId: 'release-loop',
    } as never);

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as {
      isScheduleEnabled?: boolean;
      metadata?: Record<string, unknown>;
      nodes?: Array<{ id: string; type: string }>;
      schedule?: string;
      status?: WorkflowStatus;
      steps?: Array<{ id: string; status: WorkflowStepStatus }>;
      timezone?: string;
    };

    expect(createInput).toMatchObject({
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
});

describe('WorkflowsService system workflow guardrails', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowsService({} as never, logger as never);
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

    await service.cloneWorkflow('system-workflow-1', 'user-1', 'org-1');

    const createInput = vi.mocked(service.create).mock.calls[0]?.[0] as {
      isScheduleEnabled?: boolean;
      label?: string;
      lockedNodeIds?: string[];
      metadata?: Record<string, unknown>;
      schedule?: string;
      status?: WorkflowStatus;
    };

    expect(createInput).toMatchObject({
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
