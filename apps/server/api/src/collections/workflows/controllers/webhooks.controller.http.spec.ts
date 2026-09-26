/**
 * HTTP-level composition spec for the workflow webhook endpoint, run through
 * the real global guard stack (CombinedAuthGuard as APP_GUARD), not just the
 * controller in isolation.
 *
 * Regression coverage for genfeedai/genfeed.ai#5246: this controller is
 * documented as a public, secret-gated endpoint but had no `@Public()`
 * decorator, so in CLOUD mode `CombinedAuthGuard` rejected every external
 * webhook call with its own generic 401 before the controller's timing-safe
 * secret check ever ran. `@Public()` fixes that; these tests prove the
 * controller's own check is now reachable and is the only gate.
 */
import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { WebhooksController } from './webhooks.controller';

// Same mocking pattern as combined-auth.guard.spec.ts: CombinedAuthGuard
// checks `isSelfHostedDeployment() && isBetterAuthEnabled()` for HYBRID mode,
// but with GENFEED_CLOUD=1 (stubbed below) isSelfHostedDeployment() is
// already false, so this never gets reached — mocked only so importing the
// guard doesn't need a real Better Auth client configured.
vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => false,
}));

describe('Workflow webhook HTTP composition (through the real guard stack)', () => {
  let app: INestApplication;

  const mockWorkflowWebhookService = {
    findByWebhookId: vi.fn(),
    triggerViaWebhook: vi.fn(),
  };

  const secretWorkflow = {
    id: { toString: () => 'workflow_1' },
    webhookAuthType: 'secret',
    webhookSecret: 'my-secret-key',
  };

  const bearerWorkflow = {
    id: { toString: () => 'workflow_2' },
    webhookAuthType: 'bearer',
    webhookSecret: 'my-bearer-token',
  };

  beforeAll(() => {
    // Reproduces the exact production shape from #5246: CLOUD mode is where
    // every non-@Public() route requires a valid Better Auth JWT or gf_ API
    // key, which an external webhook caller never has.
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WorkflowWebhookService,
          useValue: mockWorkflowWebhookService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        // CombinedAuthGuard's constructor dependencies. None of these are
        // ever invoked in these tests: a `@Public()` route returns `true`
        // at the guard's very first check, before any of them are touched.
        { provide: ApiKeyAuthGuard, useValue: { canActivate: vi.fn() } },
        { provide: PrismaService, useValue: {} },
        { provide: BetterAuthGuard, useValue: { canActivate: vi.fn() } },
        { provide: RequestContextMiddleware, useValue: { hydrate: vi.fn() } },
        { provide: APP_GUARD, useClass: CombinedAuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('secret auth type', () => {
    beforeEach(() => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        secretWorkflow,
      );
      mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
        runId: 'run_1',
        status: 'queued',
      });
    });

    it('succeeds with no Authorization header at all — the route is public, the secret is the only gate', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'my-secret-key')
        .send({ key: 'value' });

      expect(response.status).toBe(201);
      expect(response.body.data.runId).toBe('run_1');
    });

    it("rejects a missing secret with the controller's own 401, not the auth guard's", async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .send({ key: 'value' });

      expect(response.status).toBe(401);
      // A guard-level rejection would read "Unauthorized" / "No token
      // provided" — this must be the controller's specific message, proving
      // the request reached `triggerWebhook` and failed its own check.
      expect(response.body.error).toBe('Missing X-Webhook-Secret header');
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });

    it("rejects an invalid secret with the controller's own 401 (timing-safe compare)", async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'wrong-secret')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid webhook secret');
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });
  });

  describe('bearer auth type', () => {
    beforeEach(() => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        bearerWorkflow,
      );
      mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
        runId: 'run_2',
        status: 'queued',
      });
    });

    it('succeeds with a valid Authorization: Bearer <secret> header', async () => {
      // Before the fix, CombinedAuthGuard would already have rejected this
      // exact header shape (the secret is neither a gf_ API key nor a valid
      // Better Auth JWT) before the controller ever saw it.
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_2')
        .set('Authorization', 'Bearer my-bearer-token')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.data.runId).toBe('run_2');
    });

    it("rejects a missing Authorization header with the controller's own 401", async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_2')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toBe(
        'Missing or invalid Authorization header',
      );
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });

    it("rejects an invalid bearer token with the controller's own 401", async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_2')
        .set('Authorization', 'Bearer wrong-token')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid bearer token');
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });
  });
});
