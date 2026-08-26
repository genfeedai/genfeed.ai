import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { TasksPlanningController } from '@api/collections/tasks/controllers/tasks-planning.controller';
import { TasksModule } from '@api/collections/tasks/tasks.module';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Tasks split controllers', () => {
  it.each([
    ['openPlanThread', ':id/plan-thread', 'TasksController.openPlanThread'],
    ['createChildren', ':id/children', 'TasksController.createChildren'],
  ] as const)(
    'preserves TasksController.%s route and OpenAPI metadata',
    (methodName, path, operationId) => {
      const handler = Reflect.get(
        TasksPlanningController.prototype,
        methodName,
      );

      expect(Reflect.getMetadata(PATH_METADATA, TasksPlanningController)).toBe(
        'tasks',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId, summary: methodName });
    },
  );

  it.each(['openPlanThread', 'createChildren'] as const)(
    'removes moved handler %s from the CRUD controller',
    (methodName) => {
      expect(
        Reflect.get(TasksController.prototype, methodName),
      ).toBeUndefined();
    },
  );

  it('registers the planning sibling before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TasksModule),
    ).toEqual([TasksPlanningController, TasksController]);
  });
});
