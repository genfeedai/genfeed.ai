/**
 * Integrations E2E Tests
 * Tests integration CRUD operations with real database (MongoMemoryServer)
 * All external services are mocked to prevent real API calls
 */

import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import {
  createTestIntegration,
  createTestOrganization,
} from '@api-test/e2e/e2e-test.utils';
import {
  createTestDatabaseHelper,
  E2ETestModule,
  MockClerkGuard,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import request from 'supertest';

describe('Integrations E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let testOrganization: ReturnType<typeof createTestOrganization>;

  beforeAll(async () => {
    const dynamicModule = await E2ETestModule.forIntegrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [dynamicModule],
    })
      .overrideGuard(ClerkGuard)
      .useClass(MockClerkGuard)
      .compile();

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

    testOrganization = createTestOrganization({
      _id: new Types.ObjectId(),
      label: 'Integration Test Org',
    });

    await dbHelper.seedCollection('organizations', [testOrganization]);
  });

  const orgPath = () =>
    `/v1/organizations/${testOrganization._id}/integrations`;
  const unwrapResource = (body: unknown): Record<string, unknown> => {
    const record = body as { data?: { attributes?: Record<string, unknown> } };
    return record?.data?.attributes ?? (body as Record<string, unknown>);
  };
  const unwrapCollection = (body: unknown): Record<string, unknown>[] => {
    const record = body as {
      data?: Array<{ attributes?: Record<string, unknown> }>;
    };
    if (Array.isArray(record?.data)) {
      return record.data.map((item) => item.attributes ?? item);
    }
    return Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
  };

  describe('POST /v1/organizations/:organizationId/integrations', () => {
    it('should create a telegram integration', async () => {
      const response = await request(app.getHttpServer())
        .post(orgPath())
        .send({
          botToken: 'test-telegram-bot-token',
          config: { defaultWorkflow: 'wf-test' },
          platform: 'telegram',
        })
        .expect(201);

      const integration = unwrapResource(response.body);
      expect(integration.platform).toBe('telegram');
      expect(
        (integration.config as { defaultWorkflow?: string }).defaultWorkflow,
      ).toBe('wf-test');
    });

    it('should create a slack integration', async () => {
      const response = await request(app.getHttpServer())
        .post(orgPath())
        .send({
          botToken: 'test-slack-bot-token',
          config: { appToken: 'xapp-slack-token' },
          platform: 'slack',
        })
        .expect(201);

      const integration = unwrapResource(response.body);
      expect(integration.platform).toBe('slack');
      expect((integration.config as { appToken?: string }).appToken).toBe(
        'xapp-slack-token',
      );
    });

    it('should create a discord integration', async () => {
      const response = await request(app.getHttpServer())
        .post(orgPath())
        .send({
          botToken: 'test-discord-bot-token',
          config: { allowedUserIds: ['user1', 'user2'] },
          platform: 'discord',
        })
        .expect(201);

      const integration = unwrapResource(response.body);
      expect(integration.platform).toBe('discord');
      expect(
        (integration.config as { allowedUserIds?: string[] }).allowedUserIds,
      ).toEqual(['user1', 'user2']);
    });

    it('should reject duplicate platform for same org', async () => {
      // Create first integration
      await request(app.getHttpServer())
        .post(orgPath())
        .send({
          botToken: 'test-token-1',
          platform: 'telegram',
        })
        .expect(201);

      // Try to create duplicate
      await request(app.getHttpServer())
        .post(orgPath())
        .send({
          botToken: 'test-token-2',
          platform: 'telegram',
        })
        .expect(400);
    });

    it('should reject invalid platform', async () => {
      await request(app.getHttpServer())
        .post(orgPath())
        .send({
          botToken: 'test-token',
          platform: 'invalid_platform',
        })
        .expect(400);
    });

    it('should reject missing botToken', async () => {
      await request(app.getHttpServer())
        .post(orgPath())
        .send({
          platform: 'telegram',
        })
        .expect(400);
    });
  });

  describe('GET /v1/organizations/:organizationId/integrations', () => {
    it('should list all integrations for an org', async () => {
      // Seed integrations directly
      const telegramIntegration = createTestIntegration({
        organization: testOrganization._id,
        platform: 'telegram',
      });
      const discordIntegration = createTestIntegration({
        organization: testOrganization._id,
        platform: 'discord',
      });

      await dbHelper.seedCollection('orgintegrations', [
        telegramIntegration,
        discordIntegration,
      ]);

      const response = await request(app.getHttpServer())
        .get(orgPath())
        .expect(200);

      const integrations = unwrapCollection(response.body);
      expect(integrations).toHaveLength(2);
      const platforms = integrations.map((item) => item.platform);
      expect(platforms).toEqual(
        expect.arrayContaining(['telegram', 'discord']),
      );
    });

    it('should exclude soft-deleted integrations', async () => {
      const activeIntegration = createTestIntegration({
        isDeleted: false,
        organization: testOrganization._id,
        platform: 'telegram',
      });
      const deletedIntegration = createTestIntegration({
        isDeleted: true,
        organization: testOrganization._id,
        platform: 'discord',
      });

      await dbHelper.seedCollection('orgintegrations', [
        activeIntegration,
        deletedIntegration,
      ]);

      const response = await request(app.getHttpServer())
        .get(orgPath())
        .expect(200);

      const integrations = unwrapCollection(response.body);
      expect(integrations).toHaveLength(1);
      expect(integrations[0].platform).toBe('telegram');
    });

    it('should return empty array when no integrations exist', async () => {
      const response = await request(app.getHttpServer())
        .get(orgPath())
        .expect(200);

      const integrations = unwrapCollection(response.body);
      expect(integrations).toHaveLength(0);
    });
  });

  describe('PATCH /v1/organizations/:organizationId/integrations/:id', () => {
    it('should update integration config', async () => {
      const integration = createTestIntegration({
        organization: testOrganization._id,
        platform: 'telegram',
      });

      await dbHelper.seedCollection('orgintegrations', [integration]);

      const response = await request(app.getHttpServer())
        .patch(`${orgPath()}/${integration._id}`)
        .send({
          config: { defaultWorkflow: 'new-workflow' },
        })
        .expect(200);

      const updated = unwrapResource(response.body);
      expect(
        (updated.config as { defaultWorkflow?: string }).defaultWorkflow,
      ).toBe('new-workflow');
    });

    it('should return 404 for non-existent integration', async () => {
      const fakeId = new Types.ObjectId();

      await request(app.getHttpServer())
        .patch(`${orgPath()}/${fakeId}`)
        .send({
          config: { defaultWorkflow: 'wf-test' },
        })
        .expect(404);
    });
  });

  describe('DELETE /v1/organizations/:organizationId/integrations/:id', () => {
    it('should soft delete an integration', async () => {
      const integration = createTestIntegration({
        organization: testOrganization._id,
        platform: 'telegram',
      });

      await dbHelper.seedCollection('orgintegrations', [integration]);

      await request(app.getHttpServer())
        .delete(`${orgPath()}/${integration._id}`)
        .expect(204);

      // Verify it's gone from list
      const response = await request(app.getHttpServer())
        .get(orgPath())
        .expect(200);

      const integrations = unwrapCollection(response.body);
      expect(integrations).toHaveLength(0);
    });

    it('should return 404 for non-existent integration', async () => {
      const fakeId = new Types.ObjectId();

      await request(app.getHttpServer())
        .delete(`${orgPath()}/${fakeId}`)
        .expect(404);
    });

    it('should return 404 on re-delete of already deleted integration', async () => {
      const integration = createTestIntegration({
        organization: testOrganization._id,
        platform: 'telegram',
      });

      await dbHelper.seedCollection('orgintegrations', [integration]);

      // First delete
      await request(app.getHttpServer())
        .delete(`${orgPath()}/${integration._id}`)
        .expect(204);

      // Second delete — should be 404
      await request(app.getHttpServer())
        .delete(`${orgPath()}/${integration._id}`)
        .expect(404);
    });
  });
});
