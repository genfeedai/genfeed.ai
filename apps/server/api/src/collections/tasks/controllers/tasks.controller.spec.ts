import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import type { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { TaskSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: {
    approve: ReturnType<typeof vi.fn>;
    areAllChildrenDone: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findByIdentifier: ReturnType<typeof vi.fn>;
    findChildren: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    keepOutput: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    trashOutput: ReturnType<typeof vi.fn>;
  };
  let taskCountersService: { getNextNumber: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let agentOrchestratorService: {
    runAgent: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const organizationId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'user-1',
    publicMetadata: {
      organization: organizationId,
      user: userId,
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/tasks',
  } as Request;

  beforeEach(() => {
    tasksService = {
      approve: vi.fn(),
      areAllChildrenDone: vi.fn(),
      create: vi.fn(),
      findByIdentifier: vi.fn(),
      findChildren: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      keepOutput: vi.fn(),
      patch: vi.fn(),
      trashOutput: vi.fn(),
    };
    taskCountersService = {
      getNextNumber: vi.fn(),
    };
    organizationsService = {
      findOne: vi.fn(),
    };
    agentOrchestratorService = {
      runAgent: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    controller = new TasksController(
      loggerService as unknown as LoggerService,
      tasksService as unknown as TasksService,
      taskCountersService as unknown as TaskCountersService,
      organizationsService as unknown as OrganizationsService,
      agentOrchestratorService as unknown as AgentOrchestratorService,
    );

    vi.spyOn(TaskSerializer, 'serialize').mockImplementation(
      (data) =>
        ({
          data,
        }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a task with organization prefix and next counter number', async () => {
      const createdTask = {
        _id: '507f191e810c19729de860ee',
        identifier: 'GENA-18',
        taskNumber: 18,
        title: 'Add task tests',
      } as TaskDocument;

      organizationsService.findOne.mockResolvedValue({ prefix: 'GENA' });
      taskCountersService.getNextNumber.mockResolvedValue(18);
      tasksService.create.mockResolvedValue(createdTask);

      const result = await controller.create(mockRequest, mockUser, {
        title: 'Add task tests',
      } as CreateTaskDto);

      expect(organizationsService.findOne).toHaveBeenCalledWith({
        _id: expect.any(String),
        isDeleted: false,
      });
      expect(taskCountersService.getNextNumber).toHaveBeenCalledWith(
        organizationId,
      );
      expect(tasksService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'GENA-18',
          organization: expect.any(String),
          taskNumber: 18,
          title: 'Add task tests',
        }),
      );

      const payload = tasksService.create.mock.calls[0]?.[0] as {
        organization: string;
      };
      expect(payload.organization.toString()).toBe(organizationId);
      expect('data' in result ? result.data : result).toEqual(createdTask);
    });

    it('rejects creation when the organization is missing a prefix', async () => {
      organizationsService.findOne.mockResolvedValue({ prefix: undefined });

      await expect(
        controller.create(mockRequest, mockUser, {
          title: 'Blocked task',
        } as CreateTaskDto),
      ).rejects.toThrow(
        'Organization must have a prefix set before creating tasks',
      );

      expect(taskCountersService.getNextNumber).not.toHaveBeenCalled();
      expect(tasksService.create).not.toHaveBeenCalled();
    });
  });

  describe('buildFindAllQuery', () => {
    it('adds organization scope and optional filters to the match stage', () => {
      const parentId = '507f191e810c19729de860ee'.toString();
      const query = controller.buildFindAllQuery(mockUser, {
        assigneeAgentId: 'agent-1',
        assigneeUserId: 'user-2',
        goalId: 'goal-1',
        parentId,
        priority: 'high',
        projectId: 'project-1',
        status: 'todo',
      } as never);

      const matchStage = query as { where: Record<string, unknown> };

      expect(matchStage.where).toMatchObject({
        assigneeAgentId: 'agent-1',
        assigneeUserId: 'user-2',
        goalId: 'goal-1',
        isDeleted: false,
        priority: 'high',
        projectId: 'project-1',
        status: 'todo',
      });
      expect(matchStage.where.organization).toEqual(expect.any(String));
      expect((matchStage.where.organization as string).toString()).toBe(
        organizationId,
      );
      expect(matchStage.where.parentId).toEqual(expect.any(String));
      expect((matchStage.where.parentId as string).toString()).toBe(parentId);
    });
  });

  describe('canUserModifyEntity', () => {
    it('allows modification when the task stores organization as an ObjectId', () => {
      const entity = {
        organization: organizationId,
      } as TaskDocument;

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
    });

    it('allows modification when the task stores a populated organization object', () => {
      const entity = {
        organization: {
          _id: organizationId,
        },
      } as unknown as TaskDocument;

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
    });

    it('rejects modification when organizations differ', () => {
      const entity = {
        organization: '607f191e810c19729de860ff',
      } as TaskDocument;

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });
  });

  describe('findByIdentifier', () => {
    it('returns a serialized task when found', async () => {
      const task = {
        _id: '507f191e810c19729de860ee',
        identifier: 'GENA-18',
      } as TaskDocument;
      tasksService.findByIdentifier.mockResolvedValue(task);

      const result = await controller.findByIdentifier(
        mockRequest,
        mockUser,
        'GENA-18',
      );

      expect(tasksService.findByIdentifier).toHaveBeenCalledWith(
        'GENA-18',
        organizationId,
      );
      expect('data' in result ? result.data : result).toEqual(task);
    });

    it('throws when the identifier does not exist', async () => {
      tasksService.findByIdentifier.mockResolvedValue(null);

      await expect(
        controller.findByIdentifier(mockRequest, mockUser, 'GENA-404'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findChildren', () => {
    it('loads children in the current organization scope', async () => {
      const taskId = '507f191e810c19729de860ee'.toString();
      const children = [
        {
          _id: '507f191e810c19729de860ee',
          title: 'Child task',
        },
      ] as TaskDocument[];
      tasksService.findChildren.mockResolvedValue(children);

      const result = await controller.findChildren(
        mockRequest,
        mockUser,
        taskId,
      );

      expect(tasksService.findChildren).toHaveBeenCalledWith(
        taskId,
        organizationId,
      );
      expect('data' in result ? result.data : result).toEqual(children);
    });
  });

  describe('review actions', () => {
    const taskId = '507f191e810c19729de860ee'.toString();
    const outputId = '607f191e810c19729de860ff'.toString();
    const task = {
      _id: taskId,
      title: 'Review task',
    } as TaskDocument;

    it('passes the reviewer user id when approving a task', async () => {
      tasksService.approve.mockResolvedValue(task);

      const result = await controller.approve(mockRequest, mockUser, taskId);

      expect(tasksService.approve).toHaveBeenCalledWith(
        taskId,
        organizationId,
        userId,
      );
      expect('data' in result ? result.data : result).toEqual(task);
    });

    it('passes the reviewer user id when keeping an output', async () => {
      tasksService.keepOutput.mockResolvedValue(task);

      const result = await controller.keepOutput(
        mockRequest,
        mockUser,
        taskId,
        outputId,
      );

      expect(tasksService.keepOutput).toHaveBeenCalledWith(
        taskId,
        outputId,
        organizationId,
        userId,
      );
      expect('data' in result ? result.data : result).toEqual(task);
    });

    it('passes the reviewer user id when trashing an output', async () => {
      tasksService.trashOutput.mockResolvedValue(task);

      const result = await controller.trashOutput(
        mockRequest,
        mockUser,
        taskId,
        outputId,
      );

      expect(tasksService.trashOutput).toHaveBeenCalledWith(
        taskId,
        outputId,
        organizationId,
        userId,
      );
      expect('data' in result ? result.data : result).toEqual(task);
    });
  });
});
