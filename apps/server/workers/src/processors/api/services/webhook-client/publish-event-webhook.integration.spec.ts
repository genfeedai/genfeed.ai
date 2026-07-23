import { createHmac } from 'node:crypto';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import type { WebhookJobData } from '@genfeedai/queue-contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { WebhookClientProcessor } from '@workers/processors/api/services/webhook-client/webhook-client.processor';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

describe('publish event webhook delivery', () => {
  it('delivers a signed producer payload without coupling delivery to publish outcome', async () => {
    const queuedJobs: Array<{
      data: WebhookJobData;
      options?: { jobId?: string };
    }> = [];
    const queue = {
      add: vi.fn(
        async (
          _name: string,
          data: WebhookJobData,
          options?: { jobId?: string },
        ) => {
          queuedJobs.push({ data, options });
          return { id: options?.jobId };
        },
      ),
    };
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const settingsService = {
      findOne: vi.fn().mockResolvedValue({
        isWebhookEnabled: true,
        webhookEndpoint: 'https://8.8.8.8/publish-events',
        webhookSecret: 'integration-secret',
      }),
      recordWebhookDeliveryStatus: vi.fn().mockResolvedValue(undefined),
    };
    const postsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };
    const producer = new PublishEventWebhookService(
      queue as never,
      logger as unknown as LoggerService,
      settingsService as unknown as OrganizationSettingsService,
      postsService as unknown as PostsService,
    );

    await expect(
      producer.emitLegacyPostPublished({
        occurredAt: new Date('2026-07-23T12:00:00.000Z'),
        post: {
          credential: 'cred_123',
          id: 'target_123',
          organization: 'org_123',
          platform: 'twitter',
        },
      }),
    ).resolves.toBeUndefined();

    expect(queuedJobs).toHaveLength(2);
    const queuedTarget = queuedJobs[0];
    if (!queuedTarget) {
      throw new Error('Expected target webhook job');
    }

    const httpService = {
      post: vi.fn().mockReturnValue(of({ status: 204 })),
    };
    const consumer = new WebhookClientProcessor(
      httpService as never,
      logger as unknown as LoggerService,
      settingsService as unknown as OrganizationSettingsService,
    );
    const job = {
      attemptsMade: 0,
      data: queuedTarget.data,
      id: queuedTarget.options?.jobId,
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await consumer.process(job as never);

    const payloadString = JSON.stringify(queuedTarget.data.payload);
    const expectedSignature = createHmac('sha256', 'integration-secret')
      .update(payloadString)
      .digest('hex');

    expect(httpService.post).toHaveBeenCalledWith(
      'https://8.8.8.8/publish-events',
      queuedTarget.data.payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Genfeed-Delivery': queuedTarget.data.deliveryId,
          'X-Genfeed-Event': 'target.published',
          'X-Genfeed-Signature': `sha256=${expectedSignature}`,
        }),
      }),
    );
    expect(queuedTarget.data.payload).toMatchObject({
      event: 'target.published',
      eventId: 'publish:target.published:target_123:target_123:published',
      schemaVersion: 1,
    });
    expect(settingsService.recordWebhookDeliveryStatus).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        deliveryId: queuedTarget.data.deliveryId,
        event: 'target.published',
        status: 'delivered',
        statusCode: 204,
      }),
    );
  });
});
