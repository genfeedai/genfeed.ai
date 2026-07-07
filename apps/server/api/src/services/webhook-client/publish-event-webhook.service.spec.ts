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
