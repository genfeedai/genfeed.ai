import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import { BadRequestException } from '@nestjs/common';

describe('TaskPlanningService', () => {
  let service: TaskPlanningService;
  let tasksService: {
    requireTask: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let agentThreadsService: {
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    updateThreadMetadata: ReturnType<typeof vi.fn>;
  };
  let agentMessagesService: { getMessagesByRoom: ReturnType<typeof vi.fn> };
  let workflowExecutionsService: { findOne: ReturnType<typeof vi.fn> };
  let taskCountersService: { getNextNumber: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let agentOrchestratorService: { chat: ReturnType<typeof vi.fn> };

  const baseTask = {
    brandId: 'brand-1',
    id: 'task-1',
    linkedExecutionIds: [],
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
      create: vi.fn(),
      findOne: vi.fn().mockResolvedValue({ id: 'thread-1' }),
      updateThreadMetadata: vi.fn(),
    };
    agentMessagesService = { getMessagesByRoom: vi.fn() };
    workflowExecutionsService = { findOne: vi.fn() };
    taskCountersService = { getNextNumber: vi.fn().mockResolvedValue(7) };
    organizationsService = {
      findOne: vi.fn().mockResolvedValue({ prefix: 'ACME' }),
    };
    agentOrchestratorService = { chat: vi.fn() };

    service = new TaskPlanningService(
      tasksService as unknown as TasksService,
      agentThreadsService as unknown as AgentThreadsService,
      agentMessagesService as unknown as AgentMessagesService,
      workflowExecutionsService as unknown as WorkflowExecutionsService,
      taskCountersService as unknown as TaskCountersService,
      organizationsService as unknown as OrganizationsService,
      agentOrchestratorService as unknown as AgentOrchestratorService,
    );
  });

  describe('openPlanningThread', () => {
    it('creates, links, and seeds a new planning thread', async () => {
      tasksService.requireTask.mockResolvedValue({
        ...baseTask,
        planningThreadId: undefined,
      });
      agentThreadsService.create.mockResolvedValue({ id: 'thread-new' });

      await expect(
        service.openPlanningThread('task-1', 'org-1', 'user-1'),
      ).resolves.toEqual({
        created: true,
        seeded: true,
        threadId: 'thread-new',
      });
      expect(tasksService.patch).toHaveBeenCalledWith('task-1', {
        planningThreadId: 'thread-new',
      });
      expect(agentOrchestratorService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-new' }),
        { organizationId: 'org-1', userId: 'user-1' },
      );
    });

    it('seeds an empty planning thread through the agent orchestrator', async () => {
      agentMessagesService.getMessagesByRoom.mockResolvedValue([]);

      await expect(
        service.openPlanningThread('task-1', 'org-1', 'user-1'),
      ).resolves.toEqual({
        created: false,
        seeded: true,
        threadId: 'thread-1',
      });
      expect(agentThreadsService.updateThreadMetadata).toHaveBeenCalledWith(
        'thread-1',
        'org-1',
        expect.objectContaining({
          planModeEnabled: true,
          title: 'Plan next steps: Parent task',
        }),
      );
      expect(agentOrchestratorService.chat).toHaveBeenCalledWith(
        {
          content: expect.stringContaining('what SHOULD happen next'),
          planModeEnabled: true,
          source: 'agent',
          threadId: 'thread-1',
        },
        { organizationId: 'org-1', userId: 'user-1' },
      );
    });

    it('does not enqueue a kickoff when the planning thread already has messages', async () => {
      agentMessagesService.getMessagesByRoom.mockResolvedValue([
        { id: 'message-1' },
      ]);

      await expect(
        service.openPlanningThread('task-1', 'org-1', 'user-1'),
      ).resolves.toMatchObject({ seeded: false });
      expect(agentOrchestratorService.chat).not.toHaveBeenCalled();
    });
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

    it('enqueues every created child with the legacy workspace payload', async () => {
      const workspaceTaskWorkflowQueue = { enqueue: vi.fn() };
      tasksService.create.mockImplementation((dto) =>
        Promise.resolve({
          ...dto,
          id: `child-${tasksService.create.mock.calls.length}`,
        }),
      );
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
              ],
            },
          },
          role: 'assistant',
        },
      ]);
      service = new TaskPlanningService(
        tasksService as unknown as TasksService,
        agentThreadsService as unknown as AgentThreadsService,
        agentMessagesService as unknown as AgentMessagesService,
        workflowExecutionsService as unknown as WorkflowExecutionsService,
        taskCountersService as unknown as TaskCountersService,
        organizationsService as unknown as OrganizationsService,
        agentOrchestratorService as unknown as AgentOrchestratorService,
        workspaceTaskWorkflowQueue as unknown as WorkspaceTaskWorkflowQueueService,
      );

      const createdTasks = await service.createFollowUpTasks(
        'task-1',
        'org-1',
        'user-1',
      );
      expect(createdTasks).toHaveLength(1);
      const createdTask = createdTasks[0] as TaskDocument;

      expect(workspaceTaskWorkflowQueue.enqueue).toHaveBeenCalledWith({
        brandId: 'brand-1',
        organizationId: 'org-1',
        outputType: 'image',
        platforms: ['x'],
        request: createdTask.request,
        taskId: 'child-1',
        userId: 'user-1',
      });
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
