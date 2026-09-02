vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_request, _serializer, data) => ({
    data: data.docs,
    meta: { total: data.totalDocs },
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { TasksPlanningController } from '@api/collections/tasks/controllers/tasks-planning.controller';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import type { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { testId } from '@helpers/testing/test-id.helper';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

describe('TasksPlanningController', () => {
  const taskPlanningService = {
    createFollowUpTasks: vi.fn(),
    openPlanningThread: vi.fn(),
  };
  const controller = new TasksPlanningController(
    taskPlanningService as unknown as TaskPlanningService,
  );
  const request = { originalUrl: '/api/tasks/task-1/children' } as Request;
  const userId = testId('workspace-user');
  const user = {
    id: 'legacy-user-id',
    organizationId: 'org-1',
    userId,
  } as User;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates planning-thread orchestration with authenticated scope', async () => {
    const planThread = {
      created: true,
      seeded: true,
      threadId: 'thread-1',
    };
    taskPlanningService.openPlanningThread.mockResolvedValue(planThread);

    await expect(controller.openPlanThread(user, 'task-1')).resolves.toEqual(
      planThread,
    );
    expect(taskPlanningService.openPlanningThread).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      userId,
    );
  });

  it('delegates follow-up creation and preserves the collection envelope', async () => {
    const tasks = [
      { id: 'child-1', title: 'First child' },
      { id: 'child-2', title: 'Second child' },
    ] as TaskDocument[];
    taskPlanningService.createFollowUpTasks.mockResolvedValue(tasks);

    await expect(
      controller.createChildren(request, user, 'task-1'),
    ).resolves.toEqual({ data: tasks, meta: { total: 2 } });
    expect(taskPlanningService.createFollowUpTasks).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      userId,
    );
  });

  it.each([
    [
      'openPlanThread',
      (invalidUser: User) => controller.openPlanThread(invalidUser, 'task-1'),
    ],
    [
      'createChildren',
      (invalidUser: User) =>
        controller.createChildren(request, invalidUser, 'task-1'),
    ],
  ])(
    'preserves missing workspace-user validation for %s',
    async (_name, invoke) => {
      const invalidUser = {
        id: '',
        organizationId: 'org-1',
        userId: '',
      } as User;

      await expect(invoke(invalidUser)).rejects.toThrow(
        new UnauthorizedException(
          'Missing workspace user context. Please sign in again.',
        ),
      );
      expect(taskPlanningService.openPlanningThread).not.toHaveBeenCalled();
      expect(taskPlanningService.createFollowUpTasks).not.toHaveBeenCalled();
    },
  );
});
