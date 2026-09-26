/**
 * HTTP-level composition spec for the workflow webhook endpoint, run through
 * the real global guard stack (CombinedAuthGuard + RateLimitGuard as
 * APP_GUARD), not just the controller in isolation.
 *
 * Regression coverage for genfeedai/genfeed.ai#5246: this controller is
 * documented as a public, secret-gated endpoint but had no `@Public()`
 * decorator, so in CLOUD mode `CombinedAuthGuard` rejected every external
 * webhook call with its own generic 401 before the controller's timing-safe
 * secret check ever ran. `@Public()` fixes that.
 *
 * Regression coverage for genfeedai/genfeed.ai#5248 (the follow-up security
 * review on that fix): the public trigger now (a) rejects any stored
 * `webhookAuthType` outside `none`/`secret`/`bearer` instead of silently
 * skipping auth, (b) returns the identical generic 401 for an unknown
 * webhook ID and a bad secret (no existence oracle), and (c) is rate
 * limited, keyed on webhookId + IP.
 */
import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { CacheService } from '@api/services/cache/cache.service';
import { RateLimitPresets } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
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

const UNAUTHORIZED_BODY = { error: 'Unauthorized', status: 401 };

/**
 * Minimal in-memory stand-in for `CacheService.incr`/`expire`, tracking a
 * counter per key exactly like the real Redis-backed one — real enough to
 * exercise `RateLimitGuard`'s actual counting/limit logic, without a Redis
 * dependency in this HTTP-composition test.
 */
class FakeCacheService {
  private readonly counts = new Map<string, number>();
  private lastKey: string | undefined;

  async incr(key: string, by = 1): Promise<number> {
    this.lastKey = key;
    const next = (this.counts.get(key) ?? 0) + by;
    this.counts.set(key, next);
    return next;
  }

  async expire(_key: string, _ttlSeconds: number): Promise<boolean> {
    return true;
  }

  /** Fast-forward a key straight to a count, so a test doesn't have to send
   * `limit` real requests to prove the cap works. */
  setCount(key: string, value: number): void {
    this.counts.set(key, value);
  }

  getLastKey(): string | undefined {
    return this.lastKey;
  }
}

describe('Workflow webhook HTTP composition (through the real guard stack)', () => {
  let app: INestApplication;
  let fakeCache: FakeCacheService;

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

  const noneWorkflow = {
    id: { toString: () => 'workflow_3' },
    webhookAuthType: 'none',
    webhookSecret: null,
  };

  const noSecretWorkflow = {
    id: { toString: () => 'workflow_4' },
    webhookAuthType: 'secret',
    webhookSecret: null,
  };

  const unknownAuthTypeWorkflow = {
    id: { toString: () => 'workflow_5' },
    webhookAuthType: 'hmac',
    webhookSecret: 'irrelevant',
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
    fakeCache = new FakeCacheService();

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
        { provide: CacheService, useValue: fakeCache },
        { provide: APP_GUARD, useClass: RateLimitGuard },
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
      // A guard-level rejection would never have reached the controller at
      // all in the pre-#5246 state; this proves the request got here and
      // failed the controller's own check.
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
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
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });

    it('rejects every request when the workflow has no stored secret at all', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        noSecretWorkflow,
      );

      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_4')
        .set('X-Webhook-Secret', 'anything')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
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
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
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
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });

    it.each([
      ['surplus fields', 'Bearer my-bearer-token extra'],
      ['wrong scheme', 'Basic my-bearer-token'],
    ])('rejects a %s Authorization header', async (_label, authorization) => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_2')
        .set('Authorization', authorization)
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
    });
  });

  describe('none auth type', () => {
    it('succeeds with no credential of any kind', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        noneWorkflow,
      );
      mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
        runId: 'run_3',
        status: 'queued',
      });

      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_3')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.data.runId).toBe('run_3');
    });
  });

  describe('unrecognized stored auth type', () => {
    it('rejects outright instead of skipping authentication', async () => {
      // The BLOCKER this whole file exists to close: before this fix,
      // anything other than the literal strings 'secret'/'bearer' skipped
      // both branches and fell straight through to triggering the workflow.
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        unknownAuthTypeWorkflow,
      );

      const response = await request(app.getHttpServer())
        .post('/webhooks/workflow_5')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual(UNAUTHORIZED_BODY);
      expect(
        mockWorkflowWebhookService.triggerViaWebhook,
      ).not.toHaveBeenCalled();
    });
  });

  describe('no existence oracle', () => {
    it('returns the identical 401 for an unknown webhook id and a known id with a bad secret', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockImplementation(
        async (id: string) => (id === 'workflow_1' ? secretWorkflow : null),
      );

      const unknownIdResponse = await request(app.getHttpServer())
        .post('/webhooks/does-not-exist')
        .set('X-Webhook-Secret', 'anything')
        .send({});

      const badSecretResponse = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'wrong-secret')
        .send({});

      expect(unknownIdResponse.status).toBe(401);
      expect(badSecretResponse.status).toBe(401);
      expect(unknownIdResponse.body).toEqual(badSecretResponse.body);
      expect(unknownIdResponse.body).toEqual(UNAUTHORIZED_BODY);
    });
  });

  describe('rate limiting', () => {
    it('rejects once the per-(webhookId, IP) rate limit is exceeded', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        secretWorkflow,
      );
      mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
        runId: 'run_1',
        status: 'queued',
      });

      const first = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'my-secret-key')
        .send({});
      expect(first.status).toBe(201);

      // Fast-forward the counter to one below the limit instead of sending
      // `limit` real requests — this exercises the real RateLimitGuard
      // logic (and the real cache key it computed above) without a slow
      // test.
      const limit = RateLimitPresets.webhook.limit ?? 100;
      const key = fakeCache.getLastKey();
      if (!key) {
        throw new Error('Expected RateLimitGuard to have recorded a key');
      }
      fakeCache.setCount(key, limit - 1);

      const atLimit = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'my-secret-key')
        .send({});
      expect(atLimit.status).toBe(201);

      const overLimit = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'my-secret-key')
        .send({});
      expect(overLimit.status).toBe(429);
      expect(overLimit.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('keys the limit by webhookId, so a busy webhook does not exhaust another one sharing the same IP', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockImplementation(
        async (id: string) =>
          id === 'workflow_1' ? secretWorkflow : bearerWorkflow,
      );
      mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
        runId: 'run_1',
        status: 'queued',
      });

      const first = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'my-secret-key')
        .send({});
      expect(first.status).toBe(201);

      const limit = RateLimitPresets.webhook.limit ?? 100;
      const key = fakeCache.getLastKey();
      if (!key) {
        throw new Error('Expected RateLimitGuard to have recorded a key');
      }
      // Exhaust workflow_1's bucket completely.
      fakeCache.setCount(key, limit);

      const exhausted = await request(app.getHttpServer())
        .post('/webhooks/workflow_1')
        .set('X-Webhook-Secret', 'my-secret-key')
        .send({});
      expect(exhausted.status).toBe(429);

      // A different webhook (same IP, same test client) must not be
      // affected — it has its own counter.
      const otherWebhook = await request(app.getHttpServer())
        .post('/webhooks/workflow_2')
        .set('Authorization', 'Bearer my-bearer-token')
        .send({});
      expect(otherWebhook.status).toBe(201);
    });
  });
});
