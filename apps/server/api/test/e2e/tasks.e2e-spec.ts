import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
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
        brandId: string;
        id: string;
        organizationId: string;
        userId: string;
      };
    }>();

    request.user = {
      brandId: 'e2e-test-brand',
      id: getHeaderValue(request.headers['x-user-id']) ?? generateIdString(),
      organizationId:
        getHeaderValue(request.headers['x-organization-id']) ??
        generateIdString(),
      userId:
        getHeaderValue(request.headers['x-user-id']) ?? generateIdString(),
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
    const moduleConfig = await E2ETestModule.forTasks({
      providers: [
        {
          provide: APP_GUARD,
          useClass: TestCurrentUserGuard,
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: vi.fn(async ({ id }: { id: string }) => ({
              id,
              isDeleted: false,
            })),
          },
        },
      ],
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

    const testUserId = generateIdString();
    testUser = createTestUser({
      id: testUserId,
      email: `tasks-test-${testUserId}@example.com`,
    });

    testOrganization = createTestOrganization({
      id: generateIdString(),
      label: 'Tasks Test Organization',
      userId: testUser.id,
    });

    otherOrganization = createTestOrganization({
      id: generateIdString(),
      label: 'Other Tasks Organization',
      userId: generateIdString(),
    });

    scopedTaskId = generateIdString();

    await dbHelper.seedCollection('users', [testUser]);
    await dbHelper.seedCollection('organizations', [
      testOrganization,
      otherOrganization,
    ]);
    await dbHelper.seedCollection('tasks', [
      {
        id: scopedTaskId,
        assigneeAgentId: 'agent-1',
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        identifier: 'GENA-20',
        isDeleted: false,
        config: { linkedEntities: [] },
        organizationId: testOrganization.id,
        priority: 'high',
        status: 'todo',
        taskNumber: 20,
        title: 'Scoped task',
        updatedAt: new Date('2026-04-01T10:00:00.000Z'),
      },
      {
        id: generateIdString(),
        createdAt: new Date('2026-04-01T11:00:00.000Z'),
        identifier: 'GENA-99',
        isDeleted: false,
        config: { linkedEntities: [] },
        organizationId: otherOrganization.id,
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
      .set('x-user-id', testUser.id.toString())
      .set('x-organization-id', testOrganization.id.toString());
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
          organizationId: testOrganization.id,
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
