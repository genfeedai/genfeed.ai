import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  WEBHOOK_CLIENT_QUEUE,
  type WebhookJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { describe, expect, it, vi } from 'vitest';
import { PublishEventWebhookService } from './publish-event-webhook.service';
import { WebhookDispatchService } from './webhook-dispatch.service';

vi.mock('@api/services/webhook-client/webhook-endpoint.validator', () => ({
  assertSafeWebhookEndpoint: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

describe('PublishEventWebhookService', () => {
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let queue: { add: ReturnType<typeof vi.fn> };
  let postsService: { findAll: ReturnType<typeof vi.fn> };
  let service: PublishEventWebhookService;
  let settingsService: {
    findOne: ReturnType<typeof vi.fn>;
    recordWebhookDeliveryStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    settingsService = {
      findOne: vi.fn().mockResolvedValue({
        isWebhookEnabled: true,
        webhookEndpoint: 'https://example.com/webhook',
        webhookSecret: 'secret',
      }),
      recordWebhookDeliveryStatus: vi.fn().mockResolvedValue(undefined),
    };
    postsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishEventWebhookService,
        // The dispatcher is exercised for real here: queue ids, the org event
        // filter, and the recorded delivery status are shared behavior that a
        // mocked dispatcher would stop covering for publish events.
        WebhookDispatchService,
        {
          provide: getQueueToken(WEBHOOK_CLIENT_QUEUE),
          useValue: queue,
        },
        {
          provide: LoggerService,
          useValue: logger,
        },
        {
          provide: OrganizationSettingsService,
          useValue: settingsService,
        },
        {
          provide: PostsService,
          useValue: postsService,
        },
      ],
    }).compile();

    service = module.get(PublishEventWebhookService);
  });

  it('queues deterministic target and release events for a published post', async () => {
    const occurredAt = new Date('2026-07-07T10:00:00.000Z');

    await service.emitLegacyPostPublished({
      externalProviderId: 'post_123',
      occurredAt,
      platform: 'twitter',
      post: {
        credentialId: 'cred_123',
        id: 'post_123',
        organizationId: 'org_123',
        platform: 'twitter',
        scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
      },
      url: 'https://x.com/example/status/post_123',
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
    const firstPayload = (queue.add.mock.calls[0][1] as WebhookJobData).payload;
    expect(firstPayload).toMatchObject({
      event: 'target.published',
      eventId: 'publish:target.published:post_123:post_123:published',
      schemaVersion: 1,
    });
    expect(queue.add.mock.calls[0][2]).toMatchObject({
      jobId: expect.stringMatching(/^publish-webhook-[0-9a-f]{64}$/),
    });
    expect(queue.add.mock.calls[0][2]?.jobId).not.toContain(':');
    expect(settingsService.recordWebhookDeliveryStatus).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        attempt: 0,
        deliveryId: 'publish:target.published:post_123:post_123:published',
        event: 'target.published',
        status: 'queued',
      }),
    );

    const secondPayload = (queue.add.mock.calls[1][1] as WebhookJobData)
      .payload;
    expect(secondPayload).toMatchObject({
      event: 'release.published',
      eventId: 'publish:release.published:post_123:release:published',
      schemaVersion: 1,
    });
  });

  it('uses stable queue ids and retention for retried failed publish emissions', async () => {
    const input = {
      errorMessage: 'Provider timeout 503',
      occurredAt: new Date('2026-07-07T10:00:00.000Z'),
      post: {
        credentialId: 'cred_123',
        id: 'post_123',
        organizationId: 'org_123',
        platform: 'twitter',
      },
      retryable: false,
    };

    await service.emitLegacyPostFailed(input);
    await service.emitLegacyPostFailed(input);

    expect(queue.add).toHaveBeenCalledTimes(4);
    const jobIds = queue.add.mock.calls.map((call) => call[2]?.jobId);
    expect(jobIds[0]).toMatch(/^publish-webhook-[0-9a-f]{64}$/);
    expect(jobIds[1]).toMatch(/^publish-webhook-[0-9a-f]{64}$/);
    expect(jobIds[0]).toBe(jobIds[2]);
    expect(jobIds[1]).toBe(jobIds[3]);
    expect(new Set(jobIds).size).toBe(2);
    expect(jobIds.every((jobId) => !jobId?.includes(':'))).toBe(true);

    for (const call of queue.add.mock.calls) {
      expect(call[2]).toMatchObject({
        removeOnComplete: {
          age: 86_400,
          count: 10_000,
        },
        removeOnFail: {
          age: 604_800,
          count: 10_000,
        },
      });
      expect(call[2]).not.toHaveProperty('attempts');
      expect(call[2]).not.toHaveProperty('backoff');
    }
  });

  it('derives a partially published release event from terminal grouped posts', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          credentialId: 'cred_123',
          groupId: 'group_123',
          id: 'post_123',
          organizationId: 'org_123',
          platform: 'twitter',
          status: 'public',
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
        {
          credentialId: 'cred_456',
          groupId: 'group_123',
          id: 'post_456',
          organizationId: 'org_123',
          platform: 'linkedin',
          status: 'public',
          targetExecutionState: TargetExecutionState.FAILED,
        },
      ],
      total: 2,
    });

    await service.emitLegacyPostPublished({
      post: {
        credentialId: 'cred_123',
        groupId: 'group_123',
        id: 'post_123',
        organizationId: 'org_123',
        platform: 'twitter',
      },
    });

    const releasePayload = (queue.add.mock.calls[1][1] as WebhookJobData)
      .payload;
    expect(releasePayload).toMatchObject({
      event: 'release.partially_published',
      release: {
        id: 'group_123',
        status: 'partially-published',
        targetSummary: {
          failed: 1,
          published: 1,
          total: 2,
        },
      },
    });
  });

  it('fails grouped release events closed when the complete target set is unavailable', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          credentialId: 'cred_123',
          groupId: 'group_123',
          id: 'post_123',
          organizationId: 'org_123',
          platform: 'twitter',
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
      ],
      total: 2,
    });

    await service.emitLegacyPostPublished({
      post: {
        credentialId: 'cred_123',
        groupId: 'group_123',
        id: 'post_123',
        organizationId: 'org_123',
        platform: 'twitter',
      },
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped incomplete release projection'),
      expect.objectContaining({
        groupId: 'group_123',
        loadedTargetCount: 1,
        totalTargetCount: 2,
      }),
    );
  });

  it('redacts secret material from failed publish payloads', async () => {
    await service.emitLegacyPostFailed({
      errorMessage: 'Provider rejected access_token=abc123',
      post: {
        credentialId: 'cred_123',
        id: 'post_123',
        organizationId: 'org_123',
        platform: 'twitter',
      },
    });

    const payload = (queue.add.mock.calls[0][1] as WebhookJobData).payload;
    expect(payload.target).toMatchObject({
      error: {
        class: 'credential',
        message: 'Provider rejected access_token=[REDACTED]',
      },
    });
  });

  it('snapshots failed payloads without secret-bearing source fields', async () => {
    await service.emitLegacyPostFailed({
      errorCode: 'provider_503 api_key=raw-code-key',
      errorMessage:
        'Provider timeout 503 with api_key=raw-provider-key, Bearer raw-bearer-token, webhook_secret=raw-webhook-secret',
      occurredAt: new Date('2026-07-07T10:00:00.000Z'),
      post: {
        credential: {
          accessToken: 'encrypted-access-token',
          apiKey: 'direct-post-api-key',
          id: 'cred_123',
          refreshToken: 'encrypted-refresh-token',
          webhookSecret: 'direct-post-webhook-secret',
        },
        credentialId: 'cred_123',
        id: 'post_123',
        organizationId: 'org_123',
        platform: 'twitter',
        scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
        user: {
          apiKey: 'user-api-key',
          token: 'user-token',
        },
      },
      retryable: false,
    });

    const payload = (queue.add.mock.calls[0][1] as WebhookJobData).payload;
    const serializedPayload = JSON.stringify(payload);

    expect(serializedPayload).not.toContain('raw-provider-key');
    expect(serializedPayload).not.toContain('raw-bearer-token');
    expect(serializedPayload).not.toContain('raw-webhook-secret');
    expect(serializedPayload).not.toContain('raw-code-key');
    expect(serializedPayload).not.toContain('encrypted-access-token');
    expect(serializedPayload).not.toContain('encrypted-refresh-token');
    expect(serializedPayload).not.toContain('direct-post-api-key');
    expect(serializedPayload).not.toContain('direct-post-webhook-secret');
    expect(serializedPayload).not.toContain('user-api-key');
    expect(serializedPayload).not.toContain('user-token');
    expect(payload).toMatchInlineSnapshot(`
      {
        "event": "target.failed",
        "eventId": "publish:target.failed:post_123:post_123:failed",
        "occurredAt": "2026-07-07T10:00:00.000Z",
        "release": {
          "id": "post_123",
          "publishedAt": null,
          "scheduledAt": "2026-07-07T09:55:00.000Z",
          "status": "failed",
          "targetSummary": {
            "failed": 1,
            "published": 0,
            "total": 1,
          },
        },
        "schemaVersion": 1,
        "target": {
          "credential": {
            "id": "cred_123",
          },
          "error": {
            "class": "provider_outage",
            "code": "provider_503 api_key=[REDACTED]",
            "message": "Provider timeout 503 with api_key=[REDACTED], Bearer [REDACTED], webhook_secret=[REDACTED]",
            "retryable": false,
          },
          "externalProviderId": null,
          "externalShortcode": null,
          "id": "post_123",
          "platform": "twitter",
          "publishedAt": null,
          "scheduledAt": "2026-07-07T09:55:00.000Z",
          "status": "failed",
          "url": null,
        },
        "timestamp": "2026-07-07T10:00:00.000Z",
      }
    `);
  });

  it('keeps publish outcomes non-blocking and redacts queue diagnostics', async () => {
    queue.add.mockRejectedValueOnce(
      new Error(
        'Queue unavailable api_key=raw-api-key webhook_secret=raw-webhook-secret',
      ),
    );

    await expect(
      service.emitLegacyPostPublished({
        post: {
          credentialId: 'cred_123',
          id: 'post_123',
          organizationId: 'org_123',
          platform: 'twitter',
        },
      }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to emit publish event'),
      expect.objectContaining({
        error: 'Queue unavailable api_key=[REDACTED] webhook_secret=[REDACTED]',
        postId: 'post_123',
      }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'raw-api-key',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'raw-webhook-secret',
    );
  });
});

describe('captureFirstSuccessfulPublishBestEffort (genfeedai/genfeed.ai#4969)', () => {
  function buildService(overrides?: {
    funnelCaptureService?: { capture: ReturnType<typeof vi.fn> };
    priorPublishCount?: number;
  }) {
    const prisma = {
      post: {
        count: vi.fn().mockResolvedValue(overrides?.priorPublishCount ?? 0),
      },
    };
    const funnelCaptureService =
      overrides?.funnelCaptureService ??
      ({ capture: vi.fn().mockResolvedValue(undefined) } as {
        capture: ReturnType<typeof vi.fn>;
      });
    const service = new PublishEventWebhookService(
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {
        findAll: vi.fn().mockResolvedValue({ docs: [] }),
      } as unknown as PostsService,
      {
        dispatch: vi.fn().mockResolvedValue(null),
      } as unknown as WebhookDispatchService,
      prisma as never,
      funnelCaptureService as never,
    );

    return { funnelCaptureService, prisma, service };
  }

  // The fire-and-forget capture chain resolves on a later microtask than
  // `emitLegacyPostPublished` itself — flush the queue before asserting.
  async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
  }

  it("captures first_successful_publish, keyed by the post's owning user, exactly once for the org's first published post", async () => {
    const { funnelCaptureService, prisma, service } = buildService();

    await service.emitLegacyPostPublished({
      platform: 'twitter',
      post: { id: 'post_1', organizationId: 'org_1', userId: 'user_1' },
    });
    await flushMicrotasks();

    expect(prisma.post.count).toHaveBeenCalledTimes(1);
    expect(funnelCaptureService.capture).toHaveBeenCalledTimes(1);
    expect(funnelCaptureService.capture).toHaveBeenCalledWith({
      distinctId: 'user_1',
      event: 'first_successful_publish',
      properties: {
        $groups: { organization: 'org_1' },
        platform: 'twitter',
        surface: 'social',
      },
    });
  });

  it('is skipped when the organization already has a published post', async () => {
    const { funnelCaptureService, service } = buildService({
      priorPublishCount: 1,
    });

    await service.emitLegacyPostPublished({
      platform: 'twitter',
      post: { id: 'post_2', organizationId: 'org_1', userId: 'user_1' },
    });
    await flushMicrotasks();

    expect(funnelCaptureService.capture).not.toHaveBeenCalled();
  });

  it('is skipped without a post id or organization id', async () => {
    const { funnelCaptureService, prisma, service } = buildService();

    await service.emitLegacyPostPublished({
      platform: 'twitter',
      post: {},
    });
    await flushMicrotasks();

    expect(prisma.post.count).not.toHaveBeenCalled();
    expect(funnelCaptureService.capture).not.toHaveBeenCalled();
  });

  it('does not throw when the capture call fails, and reports it to Sentry', async () => {
    const funnelCaptureService = {
      capture: vi.fn().mockRejectedValue(new Error('network down')),
    };
    const { service } = buildService({ funnelCaptureService });

    await expect(
      service.emitLegacyPostPublished({
        platform: 'twitter',
        post: { id: 'post_3', organizationId: 'org_1', userId: 'user_1' },
      }),
    ).resolves.toBeUndefined();
    await flushMicrotasks();

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
