import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
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
