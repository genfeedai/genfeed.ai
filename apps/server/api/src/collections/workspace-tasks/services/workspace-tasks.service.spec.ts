import { WorkspaceTasksService } from '@api/collections/workspace-tasks/services/workspace-tasks.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

class WorkspaceTaskModelMock {
  static collection = { name: 'workspace-tasks' };
  static modelName = 'WorkspaceTask';
  static savedDocs: Record<string, unknown>[] = [];

  constructor(private readonly doc: Record<string, unknown>) {}

  async save() {
    WorkspaceTaskModelMock.savedDocs.push(this.doc);
    return this.doc;
  }
}

const ORGANIZATION_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';
const BRAND_ID = '507f1f77bcf86cd799439014';
const TASK_ID = '507f1f77bcf86cd799439015';

function buildTask(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: TASK_ID,
    approvedOutputIds: [],
    brand: BRAND_ID,
    eventStream: [],
    linkedApprovalIds: [],
    linkedOutputIds: [],
    linkedRunIds: [],
    organization: ORGANIZATION_ID,
    outputType: 'ingredient',
    planningThreadId: undefined,
    platforms: ['youtube'],
    priority: 'normal',
    progress: {
      activeRunCount: 0,
      percent: 100,
      stage: 'review',
    },
    request: 'Draft a launch script for our YouTube reveal.',
    requestedChangesReason: null,
    resultPreview: 'Drafted a reveal outline.',
    reviewState: 'none',
    reviewTriggered: false,
    routingSummary: 'Resolved with the YouTube setup skill.',
    status: 'completed',
    title: 'YouTube reveal launch',
    ...overrides,
  };
}

function createService() {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };
  const skillsService = {
    resolveBrandSkills: vi.fn().mockResolvedValue([]),
  };
  const agentThreadsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    updateThreadMetadata: vi.fn(),
  };
  const ingredientsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const agentMessagesService = {
    getMessagesByRoom: vi.fn().mockResolvedValue([]),
  };
  const agentRunsService = {
    getById: vi.fn(),
  };
  const notificationsPublisher = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  const service = new WorkspaceTasksService(
    WorkspaceTaskModelMock as never,
    logger as never,
    skillsService as never,
    ingredientsService as never,
    agentThreadsService as never,
    agentMessagesService as never,
    agentRunsService as never,
    notificationsPublisher as never,
  );

  return {
    agentMessagesService,
    agentRunsService,
    agentThreadsService,
    ingredientsService,
    logger,
    notificationsPublisher,
    service,
    skillsService,
  };
}

describe('WorkspaceTasksService', () => {
  it('routes brand-scoped tasks through resolved skills and persists skill metadata', async () => {
    WorkspaceTaskModelMock.savedDocs = [];
    const { service, skillsService } = createService();

    skillsService.resolveBrandSkills.mockResolvedValue([
      {
        targetSkill: {
          _id: 'skill-youtube-script-setup',
          name: 'YouTube Script Setup',
          requiredProviders: ['openai'],
          reviewDefaults: { requiresApproval: false },
          slug: 'youtube-script-setup',
          workflowStage: 'creation',
        },
        variant: {
          _id: 'variant-youtube-script-setup',
        },
      },
    ]);

    const created = await service.create({
      brand: BRAND_ID,
      organization: ORGANIZATION_ID,
      platforms: ['youtube'],
      request: 'Draft a launch script for our YouTube reveal.',
      user: USER_ID,
    } as never);

    expect(skillsService.resolveBrandSkills).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      BRAND_ID,
      {
        channel: 'youtube',
        modality: 'text',
        workflowStage: 'creation',
      },
    );
    expect(created).toEqual(
      expect.objectContaining({
        chosenProvider: 'openai',
        executionPathUsed: 'agent_orchestrator',
        reviewTriggered: false,
        routingSummary:
          'Resolved the request using the brand skill "YouTube Script Setup" (youtube-script-setup) for the creation stage.',
        skillsUsed: ['youtube-script-setup'],
        skillVariantIds: ['variant-youtube-script-setup'],
        status: 'triaged',
      }),
    );
  });

  it('falls back to caption routing when no brand skill matches', async () => {
    WorkspaceTaskModelMock.savedDocs = [];
    const { service } = createService();

    const created = await service.create({
      brand: '507f1f77bcf86cd799439021',
      organization: '507f1f77bcf86cd799439022',
      request: 'Write a launch caption for the new release.',
      user: '507f1f77bcf86cd799439023',
    } as never);

    expect(created).toEqual(
      expect.objectContaining({
        executionPathUsed: 'caption_generation',
        reviewState: 'none',
        reviewTriggered: true,
        skillsUsed: [],
        status: 'triaged',
      }),
    );
  });

  it('infers newsletter output types from GTM-native requests', async () => {
    WorkspaceTaskModelMock.savedDocs = [];
    const { service } = createService();

    const created = await service.create({
      organization: '507f1f77bcf86cd799439022',
      request: 'Draft the next weekly newsletter issue for Beehiiv.',
      user: '507f1f77bcf86cd799439023',
    } as never);

    expect(created).toEqual(
      expect.objectContaining({
        executionPathUsed: 'caption_generation',
        outputType: 'newsletter',
        reviewState: 'none',
        reviewTriggered: true,
        status: 'triaged',
      }),
    );
  });

  it('creates and links a planning thread when one does not exist', async () => {
    const { agentThreadsService, service } = createService();
    const patchSpy = vi
      .spyOn(service, 'patch')
      .mockResolvedValue(
        buildTask({ planningThreadId: 'thread-plan-1' }) as never,
      );
    vi.spyOn(service, 'findOneById').mockResolvedValue(buildTask() as never);

    agentThreadsService.findOne.mockResolvedValue(null);
    agentThreadsService.create.mockResolvedValue({ _id: 'thread-plan-1' });

    const result = await service.openPlanningThread(
      TASK_ID,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(agentThreadsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        planModeEnabled: true,
        source: `workspace-planning:${TASK_ID}`,
        title: 'Plan next steps: YouTube reveal launch',
      }),
    );
    expect(patchSpy).toHaveBeenCalledWith(TASK_ID, {
      planningThreadId: 'thread-plan-1',
    });
    expect(result).toEqual({
      created: true,
      seeded: true,
      threadId: 'thread-plan-1',
    });
  });

  it('reuses an accessible planning thread instead of creating a duplicate', async () => {
    const { agentMessagesService, agentThreadsService, service } =
      createService();
    vi.spyOn(service, 'findOneById').mockResolvedValue(
      buildTask({
        planningThreadId: 'thread-plan-existing',
      }) as never,
    );

    agentThreadsService.findOne.mockResolvedValue({
      _id: 'thread-plan-existing',
    });
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'message-1',
      },
    ]);

    const result = await service.openPlanningThread(
      TASK_ID,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(agentThreadsService.create).not.toHaveBeenCalled();
    expect(agentThreadsService.updateThreadMetadata).toHaveBeenCalledWith(
      'thread-plan-existing',
      ORGANIZATION_ID,
      expect.objectContaining({
        planModeEnabled: true,
        title: 'Plan next steps: YouTube reveal launch',
      }),
    );
    expect(result).toEqual({
      created: false,
      seeded: false,
      threadId: 'thread-plan-existing',
    });
  });

  it('rejects planning access when the workspace task is not visible in the caller org', async () => {
    const { service } = createService();
    vi.spyOn(service, 'findOneById').mockResolvedValue(null);

    await expect(
      service.openPlanningThread(TASK_ID, ORGANIZATION_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails follow-up task creation when no planning thread exists yet', async () => {
    const { service } = createService();
    vi.spyOn(service, 'findOneById').mockResolvedValue(
      buildTask({
        planningThreadId: undefined,
      }) as never,
    );

    await expect(
      service.createFollowUpTasks(TASK_ID, ORGANIZATION_ID, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails follow-up task creation when no proposed plan exists in the planning thread', async () => {
    const { agentMessagesService, agentThreadsService, service } =
      createService();
    vi.spyOn(service, 'findOneById').mockResolvedValue(
      buildTask({
        planningThreadId: 'thread-plan-existing',
      }) as never,
    );

    agentThreadsService.findOne.mockResolvedValue({
      _id: 'thread-plan-existing',
    });
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'message-1',
        metadata: {},
        role: 'assistant',
      },
    ]);

    await expect(
      service.createFollowUpTasks(TASK_ID, ORGANIZATION_ID, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates one follow-up workspace task per approved plan step', async () => {
    const { agentMessagesService, agentThreadsService, service } =
      createService();
    vi.spyOn(service, 'findOneById').mockResolvedValue(
      buildTask({
        planningThreadId: 'thread-plan-existing',
      }) as never,
    );
    const createSpy = vi
      .spyOn(service, 'create')
      .mockImplementation(async (input) => input as never);

    agentThreadsService.findOne.mockResolvedValue({
      _id: 'thread-plan-existing',
    });
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'message-1',
        metadata: {
          proposedPlan: {
            id: 'plan-approved',
            status: 'approved',
            steps: [
              {
                details:
                  'Turn the reviewed launch work into a publication-ready caption.',
                outputType: 'caption',
                title: 'Write launch caption',
              },
              {
                details:
                  'Create a companion visual that matches the approved launch narrative.',
                outputType: 'image',
                title: 'Create launch image',
              },
            ],
          },
        },
        role: 'assistant',
      },
    ]);

    const createdTasks = await service.createFollowUpTasks(
      TASK_ID,
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        brand: BRAND_ID,
        organization: ORGANIZATION_ID,
        outputType: 'caption',
        title: 'Write launch caption',
        user: USER_ID,
      }),
    );
    expect(createSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        outputType: 'image',
        title: 'Create launch image',
      }),
    );
    expect(createdTasks).toHaveLength(2);
  });
});
