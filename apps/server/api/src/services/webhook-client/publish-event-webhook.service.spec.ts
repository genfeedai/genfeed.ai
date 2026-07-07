import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  WEBHOOK_CLIENT_QUEUE,
  type WebhookJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PublishEventWebhookService } from './publish-event-webhook.service';

vi.mock('@api/services/webhook-client/webhook-endpoint.validator', () => ({
  assertSafeWebhookEndpoint: vi.fn().mockResolvedValue(undefined),
}));

describe('PublishEventWebhookService', () => {
  let queue: { add: ReturnType<typeof vi.fn> };
  let postsService: { findAll: ReturnType<typeof vi.fn> };
  let service: PublishEventWebhookService;
  let settingsService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    settingsService = {
      findOne: vi.fn().mockResolvedValue({
        isWebhookEnabled: true,
        webhookEndpoint: 'https://example.com/webhook',
        webhookSecret: 'secret',
      }),
    };
    postsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishEventWebhookService,
        {
          provide: getQueueToken(WEBHOOK_CLIENT_QUEUE),
          useValue: queue,
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
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
        credential: 'cred_123',
        id: 'post_123',
        organization: 'org_123',
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
      jobId: 'publish:target.published:post_123:post_123:published',
    });

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
        credential: 'cred_123',
        id: 'post_123',
        organization: 'org_123',
        platform: 'twitter',
      },
      retryable: false,
    };

    await service.emitLegacyPostFailed(input);
    await service.emitLegacyPostFailed(input);

    expect(queue.add).toHaveBeenCalledTimes(4);
    expect(queue.add.mock.calls.map((call) => call[2]?.jobId)).toEqual([
      'publish:target.failed:post_123:post_123:failed',
      'publish:release.failed:post_123:release:failed',
      'publish:target.failed:post_123:post_123:failed',
      'publish:release.failed:post_123:release:failed',
    ]);

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
          credential: 'cred_123',
          groupId: 'group_123',
          id: 'post_123',
          organization: 'org_123',
          platform: 'twitter',
          status: 'public',
        },
        {
          credential: 'cred_456',
          groupId: 'group_123',
          id: 'post_456',
          organization: 'org_123',
          platform: 'linkedin',
          status: 'failed',
        },
      ],
    });

    await service.emitLegacyPostPublished({
      post: {
        credential: 'cred_123',
        groupId: 'group_123',
        id: 'post_123',
        organization: 'org_123',
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

  it('redacts secret material from failed publish payloads', async () => {
    await service.emitLegacyPostFailed({
      errorMessage: 'Provider rejected access_token=abc123',
      post: {
        credential: 'cred_123',
        id: 'post_123',
        organization: 'org_123',
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
      errorCode: 'provider_503',
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
        id: 'post_123',
        organization: 'org_123',
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
            "code": "provider_503",
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

  it('does not enqueue when org webhooks are disabled', async () => {
    settingsService.findOne.mockResolvedValue({
      isWebhookEnabled: false,
      webhookEndpoint: 'https://8.8.8.8/webhook',
      webhookSecret: 'secret',
    });

    await service.emitLegacyPostPublished({
      post: {
        credential: 'cred_123',
        id: 'post_123',
        organization: 'org_123',
        platform: 'twitter',
      },
    });

    expect(queue.add).not.toHaveBeenCalled();
  });
});
