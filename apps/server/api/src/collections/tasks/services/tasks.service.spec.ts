import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import {
  TASK_STATUSES,
  Task,
  type TaskDocument,
  TaskSchema,
  type TaskStatus,
} from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('TasksService', () => {
  let service: TasksService;

  const mockModel = {
    collection: { name: 'tasks' },
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    modelName: 'Task',
  } as Record<string, ReturnType<typeof vi.fn> | { name: string }>;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockSkillsService = {
    resolveBrandSkills: vi.fn(),
  };

  const mockIngredientsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockAgentThreadsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    updateThreadMetadata: vi.fn(),
  };

  const mockAgentMessagesService = {
    getMessagesByRoom: vi.fn(),
  };

  const mockAgentRunsService = {
    getById: vi.fn(),
  };

  const mockNotificationsPublisher = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getModelToken(Task.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: SkillsService,
          useValue: mockSkillsService,
        },
        {
          provide: IngredientsService,
          useValue: mockIngredientsService,
        },
        {
          provide: AgentThreadsService,
          useValue: mockAgentThreadsService,
        },
        {
          provide: AgentMessagesService,
          useValue: mockAgentMessagesService,
        },
        {
          provide: AgentRunsService,
          useValue: mockAgentRunsService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockNotificationsPublisher,
        },
        {
          provide: TaskCountersService,
          useValue: {
            syncForOrganization: vi.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('patch', () => {
    it('allows valid status transitions before updating', async () => {
      const taskId = new Types.ObjectId().toString();
      const updatedTask = {
        _id: new Types.ObjectId(taskId),
        status: 'in_progress',
      } as TaskDocument;

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'todo',
        } as TaskDocument),
      });
      mockModel.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedTask),
        }),
      });

      const result = await service.patch(taskId, {
        status: 'in_progress',
      });

      expect(result).toBe(updatedTask);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        _id: expect.any(Types.ObjectId),
        isDeleted: false,
      });
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        taskId,
        { $set: { status: 'in_progress' } },
        { returnDocument: 'after' },
      );
    });

    it('rejects invalid status transitions', async () => {
      const taskId = new Types.ObjectId().toString();

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'backlog',
        } as TaskDocument),
      });

      await expect(
        service.patch(taskId, {
          status: 'done',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('skips transition validation when status is unchanged', async () => {
      const taskId = new Types.ObjectId().toString();

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'done',
        } as TaskDocument),
      });
      mockModel.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            _id: new Types.ObjectId(taskId),
            status: 'done',
          } as TaskDocument),
        }),
      });

      await expect(
        service.patch(taskId, {
          status: 'done',
        }),
      ).resolves.toBeDefined();

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('findByIdentifier', () => {
    it('filters to non-deleted tasks', async () => {
      const task = {
        _id: new Types.ObjectId(),
        identifier: 'GENA-18',
      } as TaskDocument;
      mockModel.findOne.mockResolvedValue(task);

      const result = await service.findByIdentifier('GENA-18');

      expect(result).toBe(task);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        identifier: 'GENA-18',
        isDeleted: false,
      });
    });
  });

  describe('findChildren', () => {
    it('scopes child lookup by organization and parent task', async () => {
      const taskId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();
      const children = [
        {
          _id: new Types.ObjectId(),
          parentId: new Types.ObjectId(taskId),
        },
      ] as TaskDocument[];

      mockModel.find.mockResolvedValue(children);

      const result = await service.findChildren(taskId, organizationId);

      expect(result).toBe(children);
      expect(mockModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(Types.ObjectId),
        parentId: expect.any(Types.ObjectId),
      });

      const filter = mockModel.find.mock.calls[0]?.[0] as {
        organization: Types.ObjectId;
        parentId: Types.ObjectId;
      };
      expect(filter.organization.toString()).toBe(organizationId);
      expect(filter.parentId.toString()).toBe(taskId);
    });
  });

  describe('areAllChildrenDone', () => {
    it('returns false when there are no children', async () => {
      vi.spyOn(service, 'findChildren').mockResolvedValue([]);

      await expect(
        service.areAllChildrenDone(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
        ),
      ).resolves.toBe(false);
    });

    it('returns true when every child is done or cancelled', async () => {
      vi.spyOn(service, 'findChildren').mockResolvedValue([
        { status: 'done' },
        { status: 'cancelled' },
      ] as TaskDocument[]);

      await expect(
        service.areAllChildrenDone(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
        ),
      ).resolves.toBe(true);
    });

    it('returns false when any child is still open', async () => {
      vi.spyOn(service, 'findChildren').mockResolvedValue([
        { status: 'done' },
        { status: 'blocked' as TaskStatus },
      ] as TaskDocument[]);

      await expect(
        service.areAllChildrenDone(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
        ),
      ).resolves.toBe(false);
    });
  });

  describe('checkout', () => {
    it('sets checkout metadata and moves the task in progress', async () => {
      const taskId = new Types.ObjectId().toString();
      const agentId = 'agent-1';
      const runId = 'run-1';
      const updatedTask = {
        _id: new Types.ObjectId(taskId),
        checkoutAgentId: agentId,
        checkoutRunId: runId,
        status: 'in_progress',
      } as TaskDocument;

      mockModel.findOneAndUpdate.mockResolvedValue(updatedTask);

      const result = await service.checkout(taskId, agentId, runId);

      expect(result).toBe(updatedTask);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(Types.ObjectId),
          $or: [
            { checkoutAgentId: null },
            { checkoutAgentId: { $exists: false } },
            { checkoutAgentId: agentId },
          ],
          isDeleted: false,
        },
        {
          $set: {
            checkedOutAt: expect.any(Date),
            checkoutAgentId: agentId,
            checkoutRunId: runId,
            status: 'in_progress',
          },
        },
        { new: true },
      );
    });
  });

  describe('release', () => {
    it('clears checkout metadata for the current agent', async () => {
      const taskId = new Types.ObjectId().toString();
      const agentId = 'agent-1';
      const releasedTask = {
        _id: new Types.ObjectId(taskId),
      } as TaskDocument;

      mockModel.findOneAndUpdate.mockResolvedValue(releasedTask);

      const result = await service.release(taskId, agentId);

      expect(result).toBe(releasedTask);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(Types.ObjectId),
          checkoutAgentId: agentId,
          isDeleted: false,
        },
        {
          $unset: {
            checkedOutAt: '',
            checkoutAgentId: '',
            checkoutRunId: '',
          },
        },
        { new: true },
      );
    });

    it('throws when the task is not checked out by the current agent', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.release(new Types.ObjectId().toString(), 'agent-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('schema constants', () => {
    it('TASK_STATUSES includes failed', () => {
      expect(TASK_STATUSES).toContain('failed');
    });

    it('Task schema has AI execution fields in Mongoose schema paths', () => {
      const paths = Object.keys(TaskSchema.paths);
      const aiFields = [
        'request',
        'outputType',
        'platforms',
        'reviewState',
        'reviewTriggered',
        'resultPreview',
        'executionPathUsed',
        'skillsUsed',
        'progress',
        'eventStream',
        'linkedRunIds',
        'linkedOutputIds',
        'approvedOutputIds',
      ];
      for (const field of aiFields) {
        expect(paths).toContain(field);
      }
    });
  });

  describe('AI task methods — exist on service', () => {
    it('listInbox method exists', () => {
      expect(typeof service.listInbox).toBe('function');
    });

    it('approve method exists', () => {
      expect(typeof service.approve).toBe('function');
    });

    it('recordTaskEvent method exists', () => {
      expect(typeof service.recordTaskEvent).toBe('function');
    });
  });

  describe('create — AI routing', () => {
    it('routes a tweet request to caption_generation when no skills are matched', async () => {
      const organizationId = new Types.ObjectId().toString();
      const brandId = new Types.ObjectId().toString();
      const taskId = new Types.ObjectId();
      const expectedTask = {
        _id: taskId,
        executionPathUsed: 'caption_generation',
        outputType: 'post',
        status: 'backlog',
      } as Partial<TaskDocument>;

      mockSkillsService.resolveBrandSkills.mockResolvedValue([]);

      // Spy on BaseService.create to avoid Mongoose model constructor requirement
      const BaseService = Object.getPrototypeOf(Object.getPrototypeOf(service));
      const superCreateSpy = vi
        .spyOn(BaseService, 'create')
        .mockResolvedValue(expectedTask as TaskDocument);

      const result = await service.create({
        brand: brandId,
        organization: organizationId,
        request: 'Write a tweet about our new product launch',
        title: 'New product tweet',
      } as CreateTaskDto & { brand?: string; organization?: string });

      expect(result).toBe(expectedTask);
      expect(mockSkillsService.resolveBrandSkills).toHaveBeenCalledWith(
        organizationId,
        brandId,
        expect.objectContaining({ workflowStage: 'creation' }),
      );
      // Verify routing fields are merged into the super.create call
      expect(superCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          executionPathUsed: 'caption_generation',
          status: 'backlog',
        }),
      );
      superCreateSpy.mockRestore();
    });
  });

  describe('status transitions — failed status', () => {
    it('allows in_progress → failed', async () => {
      const taskId = new Types.ObjectId().toString();
      const updatedTask = {
        _id: new Types.ObjectId(taskId),
        status: 'failed',
      } as TaskDocument;

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'in_progress',
        } as TaskDocument),
      });
      mockModel.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedTask),
        }),
      });

      await expect(
        service.patch(taskId, { status: 'failed' }),
      ).resolves.toBeDefined();
    });

    it('allows failed → backlog', async () => {
      const taskId = new Types.ObjectId().toString();
      const updatedTask = {
        _id: new Types.ObjectId(taskId),
        status: 'backlog',
      } as TaskDocument;

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'failed',
        } as TaskDocument),
      });
      mockModel.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedTask),
        }),
      });

      await expect(
        service.patch(taskId, { status: 'backlog' }),
      ).resolves.toBeDefined();
    });

    it('allows failed → in_progress', async () => {
      const taskId = new Types.ObjectId().toString();
      const updatedTask = {
        _id: new Types.ObjectId(taskId),
        status: 'in_progress',
      } as TaskDocument;

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'failed',
        } as TaskDocument),
      });
      mockModel.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedTask),
        }),
      });

      await expect(
        service.patch(taskId, { status: 'in_progress' }),
      ).resolves.toBeDefined();
    });

    it('rejects failed → done', async () => {
      const taskId = new Types.ObjectId().toString();

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(taskId),
          status: 'failed',
        } as TaskDocument),
      });

      await expect(service.patch(taskId, { status: 'done' })).rejects.toThrow(
        "Cannot transition from 'failed' to 'done'",
      );
    });
  });
});
