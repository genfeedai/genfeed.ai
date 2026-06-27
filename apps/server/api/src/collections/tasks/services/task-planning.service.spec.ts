import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { BadRequestException } from '@nestjs/common';

describe('TaskPlanningService', () => {
  let service: TaskPlanningService;
  let tasksService: {
    requireTask: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let agentThreadsService: { findOne: ReturnType<typeof vi.fn> };
  let agentMessagesService: { getMessagesByRoom: ReturnType<typeof vi.fn> };
  let agentRunsService: { getById: ReturnType<typeof vi.fn> };
  let taskCountersService: { getNextNumber: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };

  const baseTask = {
    brandId: 'brand-1',
    id: 'task-1',
    linkedRunIds: [],
    organizationId: 'org-1',
    outputType: 'ingredient',
    planningThreadId: 'thread-1',
    platforms: ['x'],
    priority: 'medium',
    request: 'Original request',
    title: 'Parent task',
  };

  beforeEach(() => {
    tasksService = {
      create: vi.fn().mockImplementation((d) => Promise.resolve(d)),
      patch: vi.fn(),
      requireTask: vi.fn().mockResolvedValue(baseTask),
    };
    agentThreadsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    };
    agentMessagesService = { getMessagesByRoom: vi.fn() };
    agentRunsService = { getById: vi.fn() };
    taskCountersService = { getNextNumber: vi.fn().mockResolvedValue(7) };
    organizationsService = {
      findOne: vi.fn().mockResolvedValue({ prefix: 'ACME' }),
    };

    service = new TaskPlanningService(
      tasksService as unknown as TasksService,
      agentThreadsService as unknown as AgentThreadsService,
      agentMessagesService as unknown as AgentMessagesService,
      agentRunsService as unknown as AgentRunsService,
      taskCountersService as unknown as TaskCountersService,
      organizationsService as unknown as OrganizationsService,
    );
  });

  describe('createFollowUpTasks', () => {
    it('creates child tasks from the latest approved plan steps', async () => {
      agentMessagesService.getMessagesByRoom.mockResolvedValue([
        {
          metadata: {
            proposedPlan: {
              status: 'approved',
              steps: [
                {
                  details: 'Shoot the hero shot',
                  outputType: 'image',
                  title: 'Create hero image',
                },
                { title: 'Write the caption', type: 'caption' },
              ],
            },
          },
          role: 'assistant',
        },
      ]);

      const created = await service.createFollowUpTasks(
        'task-1',
        'org-1',
        'user-1',
      );

      expect(created).toHaveLength(2);
      expect(tasksService.create).toHaveBeenCalledTimes(2);
      expect(tasksService.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          identifier: 'ACME-7',
          outputType: 'image',
          title: 'Create hero image',
          userId: 'user-1',
        }),
      );
      // request bundles the source-task context
      const firstArg = tasksService.create.mock.calls[0][0];
      expect(firstArg.request).toContain('Source task: Parent task (task-1)');
      expect(firstArg.request).toContain('Shoot the hero shot');
    });

    it('throws when no planning thread is accessible', async () => {
      agentThreadsService.findOne.mockResolvedValue(null);

      await expect(
        service.createFollowUpTasks('task-1', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the latest plan is not approved', async () => {
      agentMessagesService.getMessagesByRoom.mockResolvedValue([
        {
          metadata: { proposedPlan: { status: 'draft', steps: [] } },
          role: 'assistant',
        },
      ]);

      await expect(
        service.createFollowUpTasks('task-1', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when an approved plan has no usable steps', async () => {
      agentMessagesService.getMessagesByRoom.mockResolvedValue([
        {
          metadata: { proposedPlan: { status: 'approved', steps: [] } },
          role: 'assistant',
        },
      ]);

      await expect(
        service.createFollowUpTasks('task-1', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPlanningPrompt', () => {
    it('builds a kickoff prompt from the task title', async () => {
      const prompt = await service.getPlanningPrompt('task-1', 'org-1');
      expect(prompt).toContain('Parent task');
      expect(prompt).toContain('what SHOULD happen next');
    });
  });
});
