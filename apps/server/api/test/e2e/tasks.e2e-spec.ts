import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { Task, TaskSchema } from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import {
  createTestOrganization,
  createTestUser,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import {
  createTestDatabaseHelper,
  E2ETestModule,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

class TestCurrentUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: {
        id: string;
        publicMetadata: {
          organization: string;
          user: string;
        };
      };
    }>();

    request.user = {
      id:
        getHeaderValue(request.headers['x-clerk-user-id']) ?? 'clerk_test_user',
      publicMetadata: {
        organization:
          getHeaderValue(request.headers['x-organization-id']) ??
          generateIdString(),
        user:
          getHeaderValue(request.headers['x-user-id']) ?? generateIdString(),
      },
    };

    return true;
  }
}

function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

describe('Tasks E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;

  let testUser: ReturnType<typeof createTestUser>;
  let testOrganization: ReturnType<typeof createTestOrganization>;
  let otherOrganization: ReturnType<typeof createTestOrganization>;
  let scopedTaskId: string;

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot({
      controllers: [TasksController],
      providers: [
        TasksService,
        {
          provide: APP_GUARD,
          useClass: TestCurrentUserGuard,
        },
        {
          provide: TaskCountersService,
          useValue: {
            getNextNumber: vi.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
      ],
      schemas: [{ name: Task.name, schema: TaskSchema }],
      useMockGuards: false,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    app.setGlobalPrefix('v1');

    await app.init();

    dbHelper = createTestDatabaseHelper(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();

    testUser = createTestUser({
      _id: generateIdString(),
      clerkId: 'clerk_task_test_user',
      email: 'tasks-test@example.com',
    });

    testOrganization = createTestOrganization({
      _id: generateIdString(),
      label: 'Tasks Test Organization',
      user: testUser._id,
    });

    otherOrganization = createTestOrganization({
      _id: generateIdString(),
      label: 'Other Tasks Organization',
      user: generateIdString(),
    });

    scopedTaskId = generateIdString();

    await dbHelper.seedCollection('users', [testUser]);
    await dbHelper.seedCollection('organizations', [
      testOrganization,
      otherOrganization,
    ]);
    await dbHelper.seedCollection('tasks', [
      {
        _id: scopedTaskId,
        assigneeAgentId: 'agent-1',
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        identifier: 'GENA-20',
        isDeleted: false,
        linkedEntities: [],
        organization: testOrganization._id,
        priority: 'high',
        status: 'todo',
        taskNumber: 20,
        title: 'Scoped task',
        updatedAt: new Date('2026-04-01T10:00:00.000Z'),
      },
      {
        _id: generateIdString(),
        createdAt: new Date('2026-04-01T11:00:00.000Z'),
        identifier: 'GENA-99',
        isDeleted: false,
        linkedEntities: [],
        organization: otherOrganization._id,
        priority: 'low',
        status: 'backlog',
        taskNumber: 99,
        title: 'Other organization task',
        updatedAt: new Date('2026-04-01T11:00:00.000Z'),
      },
    ]);
  });

  function authenticatedRequest(
    method: 'get' | 'patch' | 'post' | 'delete',
    url: string,
  ) {
    return request(app.getHttpServer())
      [method](url)
      .set('Authorization', 'Bearer mock-jwt-token')
      .set('x-clerk-user-id', testUser.clerkId)
      .set('x-user-id', testUser._id.toString())
      .set('x-organization-id', testOrganization._id.toString());
  }

  describe('GET /v1/tasks', () => {
    it('returns only tasks for the current organization with serialized attributes', async () => {
      const response = await authenticatedRequest('get', '/v1/tasks').expect(
        200,
      );

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('links.pagination');
      expect(response.body.data).toHaveLength(1);

      expect(response.body.data[0]).toMatchObject({
        attributes: expect.objectContaining({
          assigneeAgentId: 'agent-1',
          identifier: 'GENA-20',
          priority: 'high',
          status: 'todo',
          taskNumber: 20,
          title: 'Scoped task',
        }),
        id: scopedTaskId.toString(),
      });
      expect(response.body.links.pagination.total).toBe(1);
    });
  });

  describe('GET /v1/tasks/:id', () => {
    it('returns the inherited findOne response through the task serializer', async () => {
      const response = await authenticatedRequest(
        'get',
        `/v1/tasks/${scopedTaskId.toString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toMatchObject({
        attributes: expect.objectContaining({
          identifier: 'GENA-20',
          taskNumber: 20,
          title: 'Scoped task',
        }),
        id: scopedTaskId.toString(),
      });
    });
  });
});
