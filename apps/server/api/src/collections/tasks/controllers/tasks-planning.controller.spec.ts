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
    // Echoes the scope it was given into the thread it opens.
    taskPlanningService.openPlanningThread.mockImplementation(
      async (
        taskId: string,
        organizationId: string,
        workspaceUserId: string,
      ) => ({
        created: true,
        seeded: true,
        threadId: `${organizationId}/${workspaceUserId}/${taskId}`,
      }),
    );

    await expect(controller.openPlanThread(user, 'task-1')).resolves.toEqual({
      created: true,
      seeded: true,
      threadId: `org-1/${userId}/task-1`,
    });
  });

  it('delegates follow-up creation and preserves the collection envelope', async () => {
    // Echoes the scope it was given into the children it creates.
    taskPlanningService.createFollowUpTasks.mockImplementation(
      async (
        parentId: string,
        organizationId: string,
        workspaceUserId: string,
      ) =>
        [
          { id: 'child-1', organizationId, parentId, userId: workspaceUserId },
          { id: 'child-2', organizationId, parentId, userId: workspaceUserId },
        ] as unknown as TaskDocument[],
    );

    await expect(
      controller.createChildren(request, user, 'task-1'),
    ).resolves.toEqual({
      data: [
        { id: 'child-1', organizationId: 'org-1', parentId: 'task-1', userId },
        { id: 'child-2', organizationId: 'org-1', parentId: 'task-1', userId },
      ],
      meta: { total: 2 },
    });
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
