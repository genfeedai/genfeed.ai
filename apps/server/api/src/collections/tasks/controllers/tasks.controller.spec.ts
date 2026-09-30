import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import type { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { TaskSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: {
    approve: ReturnType<typeof vi.fn>;
    areAllChildrenDone: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    findByIdentifier: ReturnType<typeof vi.fn>;
    findChildren: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    keepOutput: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    requestChanges: ReturnType<typeof vi.fn>;
    trashOutput: ReturnType<typeof vi.fn>;
    unkeepOutput: ReturnType<typeof vi.fn>;
  };
  let taskCountersService: { getNextNumber: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const organizationId = testId('org');
  const userId = testId('user');
  const brandId = testId('brand');

  const mockUser = {
    id: 'user-1',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/tasks',
  } as Request;

  beforeEach(() => {
    tasksService = {
      approve: vi.fn(),
      areAllChildrenDone: vi.fn(),
      create: vi.fn(),
      dismiss: vi.fn(),
      findByIdentifier: vi.fn(),
      findChildren: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      keepOutput: vi.fn(),
      patch: vi.fn(),
      requestChanges: vi.fn(),
      trashOutput: vi.fn(),
      unkeepOutput: vi.fn(),
    };
    taskCountersService = {
      getNextNumber: vi.fn(),
    };
    organizationsService = {
      findOne: vi.fn(),
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
        id: testId('task'),
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
        id: organizationId,
      });
      expect(taskCountersService.getNextNumber).toHaveBeenCalledWith(
        organizationId,
      );
      expect(tasksService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          identifier: 'GENA-18',
          organizationId,
          taskNumber: 18,
          title: 'Add task tests',
          userId,
        }),
      );
      expect('data' in result ? result.data : result).toEqual(createdTask);
    });

    it('uses an explicit canonical brand ID instead of the session default', async () => {
      const requestedBrandId = testId('brand', 2);
      organizationsService.findOne.mockResolvedValue({ prefix: 'GENA' });
      taskCountersService.getNextNumber.mockResolvedValue(19);
      tasksService.create.mockResolvedValue({
        id: testId('task', 2),
        title: 'Cross-brand task',
      });

      await controller.create(mockRequest, mockUser, {
        brandId: requestedBrandId,
        title: 'Cross-brand task',
      } as CreateTaskDto);

      expect(tasksService.create).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: requestedBrandId }),
      );
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
      const parentId = testId('parent');
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
      expect(matchStage.where.organizationId).toBe(organizationId);
      expect(matchStage.where.parentId).toEqual(expect.any(String));
      expect((matchStage.where.parentId as string).toString()).toBe(parentId);
    });
  });

  describe('canUserModifyEntity', () => {
    it('allows modification when the canonical organization ID matches', () => {
      const entity = {
        organizationId,
      } as TaskDocument;

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
    });

    it('does not authorize from the legacy organization relation alias', () => {
      const entity = {
        organization: {
          id: organizationId,
        },
      } as unknown as TaskDocument;

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('rejects modification when organizations differ', () => {
      const entity = {
        organizationId: testId('org', 2),
      } as TaskDocument;

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });
  });

  describe('findByIdentifier', () => {
    it('returns a serialized task when found', async () => {
      const task = {
        id: testId('task'),
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
      const taskId = testId('task');
      const children = [
        {
          id: taskId,
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

  describe('review transitions via patch', () => {
    const taskId = testId('task');
    const task = {
      id: taskId,
      title: 'Review task',
    } as TaskDocument;

    it('routes reviewState=approved to the approve action', async () => {
      tasksService.approve.mockResolvedValue(task);

      const result = await controller.patch(mockRequest, mockUser, taskId, {
        reviewState: 'approved',
      } as UpdateTaskDto);

      expect(tasksService.approve).toHaveBeenCalledWith(
        taskId,
        organizationId,
        userId,
      );
      expect('data' in result ? result.data : result).toEqual(task);
    });

    it('routes reviewState=changes_requested with the reason', async () => {
      tasksService.requestChanges.mockResolvedValue(task);

      await controller.patch(mockRequest, mockUser, taskId, {
        reason: 'tighten the hook',
        reviewState: 'changes_requested',
      } as UpdateTaskDto);

      expect(tasksService.requestChanges).toHaveBeenCalledWith(
        taskId,
        organizationId,
        userId,
        'tighten the hook',
      );
    });

    it('routes reviewState=dismissed', async () => {
      tasksService.dismiss.mockResolvedValue(task);

      await controller.patch(mockRequest, mockUser, taskId, {
        reviewState: 'dismissed',
      } as UpdateTaskDto);

      expect(tasksService.dismiss).toHaveBeenCalledWith(
        taskId,
        organizationId,
        userId,
        undefined,
      );
    });

    it('rejects a reviewState transition mixed with other fields', async () => {
      await expect(
        controller.patch(mockRequest, mockUser, taskId, {
          reviewState: 'approved',
          title: 'also renaming',
        } as UpdateTaskDto),
      ).rejects.toThrow(BadRequestException);

      expect(tasksService.approve).not.toHaveBeenCalled();
    });
  });

  describe('output actions', () => {
    const taskId = testId('task');
    const outputId = testId('output');
    const task = {
      id: taskId,
      title: 'Review task',
    } as TaskDocument;

    it('keeps an output when isKept is true', async () => {
      tasksService.keepOutput.mockResolvedValue(task);

      const result = await controller.setOutputKept(
        mockRequest,
        mockUser,
        taskId,
        outputId,
        { isKept: true },
      );

      expect(tasksService.keepOutput).toHaveBeenCalledWith(
        taskId,
        outputId,
        organizationId,
        userId,
      );
      expect('data' in result ? result.data : result).toEqual(task);
    });

    it('un-keeps an output when isKept is false', async () => {
      tasksService.unkeepOutput.mockResolvedValue(task);

      await controller.setOutputKept(mockRequest, mockUser, taskId, outputId, {
        isKept: false,
      });

      expect(tasksService.unkeepOutput).toHaveBeenCalledWith(
        taskId,
        outputId,
        organizationId,
      );
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
