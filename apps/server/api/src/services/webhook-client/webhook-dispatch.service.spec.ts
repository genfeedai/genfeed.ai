import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  WEBHOOK_CLIENT_QUEUE,
  type WebhookJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatchService } from './webhook-dispatch.service';

vi.mock('@api/services/webhook-client/webhook-endpoint.validator', () => ({
  assertSafeWebhookEndpoint: vi.fn().mockResolvedValue(undefined),
}));

describe('WebhookDispatchService', () => {
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let queue: { add: ReturnType<typeof vi.fn> };
  let service: WebhookDispatchService;
  let settingsService: {
    findOne: ReturnType<typeof vi.fn>;
    recordWebhookDeliveryStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    settingsService = {
      findOne: vi.fn().mockResolvedValue({
        isWebhookEnabled: true,
        webhookEndpoint: 'https://example.com/webhook',
        webhookSecret: 'secret',
      }),
      recordWebhookDeliveryStatus: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDispatchService,
        { provide: getQueueToken(WEBHOOK_CLIENT_QUEUE), useValue: queue },
        { provide: LoggerService, useValue: logger },
        { provide: OrganizationSettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get(WebhookDispatchService);
  });

  const generationPayload = {
    event: 'generation.completed' as const,
    eventId: 'generation:generation.completed:image:ingredient_1:completed',
    timestamp: '2026-07-07T10:00:00.000Z',
  };

  it('queues a deterministic job id and records the delivery status', async () => {
    const status = await service.dispatch('org_123', generationPayload, {
      jobIdPrefix: 'generation-webhook-',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        deliveryId: generationPayload.eventId,
        endpoint: 'https://example.com/webhook',
        organizationId: 'org_123',
        payload: generationPayload,
        secret: 'secret',
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^generation-webhook-[0-9a-f]{64}$/),
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      }),
    );
    expect(queue.add.mock.calls[0][2]?.jobId).not.toContain(':');
    expect(status).toMatchObject({
      attempt: 0,
      deliveryId: generationPayload.eventId,
      event: 'generation.completed',
      isTest: false,
      status: 'queued',
    });
    expect(settingsService.recordWebhookDeliveryStatus).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({ status: 'queued' }),
    );
  });

  it('reuses one job id across retried emissions of the same event', async () => {
    await service.dispatch('org_123', generationPayload, {
      jobIdPrefix: 'generation-webhook-',
    });
    await service.dispatch('org_123', generationPayload, {
      jobIdPrefix: 'generation-webhook-',
    });

    const jobIds = queue.add.mock.calls.map((call) => call[2]?.jobId);
    expect(new Set(jobIds).size).toBe(1);
  });

  it('does not queue when org webhooks are disabled', async () => {
    settingsService.findOne.mockResolvedValue({
      isWebhookEnabled: false,
      webhookEndpoint: 'https://example.com/webhook',
      webhookSecret: 'secret',
    });

    await expect(
      service.dispatch('org_123', generationPayload),
    ).resolves.toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('honors an org event filter that excludes the event', async () => {
    settingsService.findOne.mockResolvedValue({
      isWebhookEnabled: true,
      webhookEndpoint: 'https://example.com/webhook',
      webhookEventTypes: ['workflow.execution.failed'],
      webhookSecret: 'secret',
    });

    await expect(
      service.dispatch('org_123', generationPayload),
    ).resolves.toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
    expect(settingsService.recordWebhookDeliveryStatus).not.toHaveBeenCalled();
  });

  it('queues events an org filter explicitly opts into', async () => {
    settingsService.findOne.mockResolvedValue({
      isWebhookEnabled: true,
      webhookEndpoint: 'https://example.com/webhook',
      webhookEventTypes: ['generation.completed'],
      webhookSecret: 'secret',
    });

    await service.dispatch('org_123', generationPayload);

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      event: 'target.published' as const,
      jobIdPrefix: /^publish-webhook-[0-9a-f]{64}$/,
      sampleKey: 'release',
    },
    {
      event: 'generation.completed' as const,
      jobIdPrefix: /^generation-webhook-[0-9a-f]{64}$/,
      sampleKey: 'generation',
    },
    {
      event: 'workflow.execution.failed' as const,
      jobIdPrefix: /^workflow-webhook-[0-9a-f]{64}$/,
      sampleKey: 'execution',
    },
  ])(
    'queues a sample $event test delivery that bypasses the org filter',
    async ({ event, jobIdPrefix, sampleKey }) => {
      settingsService.findOne.mockResolvedValue({
        isWebhookEnabled: true,
        webhookEndpoint: 'https://example.com/webhook',
        // Deliberately excludes every event under test.
        webhookEventTypes: ['release.partially_published'],
        webhookSecret: 'secret',
      });

      const status = await service.sendTestDelivery({
        event,
        organizationId: 'org_123',
      });

      expect(status).toMatchObject({
        attempt: 0,
        event,
        isTest: true,
        status: 'queued',
      });
      expect(status.deliveryId).toContain('webhook-test:org_123');
      expect(queue.add).toHaveBeenCalledWith(
        'send-webhook',
        expect.objectContaining({
          deliveryId: status.deliveryId,
          isTest: true,
          organizationId: 'org_123',
          payload: expect.objectContaining({ event }),
        }),
        { jobId: expect.stringMatching(jobIdPrefix) },
      );
      const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
      expect(jobData.payload).toHaveProperty(sampleKey);
      expect(queue.add.mock.calls[0][2]?.jobId).not.toContain(':');
    },
  );

  it('rejects a test delivery when no endpoint is configured', async () => {
    settingsService.findOne.mockResolvedValue({
      isWebhookEnabled: true,
      webhookEndpoint: null,
      webhookSecret: null,
    });

    await expect(
      service.sendTestDelivery({ organizationId: 'org_123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redacts secret material from a failing test delivery', async () => {
    queue.add.mockRejectedValueOnce(
      new Error('Queue unavailable api_key=raw-api-key'),
    );

    await expect(
      service.sendTestDelivery({
        event: 'generation.failed',
        organizationId: 'org_123',
      }),
    ).rejects.toThrow('Queue unavailable api_key=[REDACTED]');
  });
});
