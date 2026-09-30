import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import { GenerationEventWebhookService } from './generation-event-webhook.service';
import type { WebhookDispatchService } from './webhook-dispatch.service';

function makeService() {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const webhookDispatchService = {
    dispatch: vi.fn().mockResolvedValue(null),
  };
  const service = new GenerationEventWebhookService(
    logger as unknown as LoggerService,
    webhookDispatchService as unknown as WebhookDispatchService,
  );

  return { logger, service, webhookDispatchService };
}

describe('GenerationEventWebhookService', () => {
  const occurredAt = new Date('2026-07-07T10:00:00.000Z');

  it.each(['image', 'video', 'article'] as const)(
    'emits a completed %s generation with a deterministic event id',
    async (kind) => {
      const { service, webhookDispatchService } = makeService();

      await service.emitGenerationCompleted({
        brandId: 'brand_1',
        generationId: 'generation_1',
        kind,
        model: 'flux-dev',
        occurredAt,
        organizationId: 'org_123',
        output: {
          mimeType: 'image/png',
          storageKey: 'ingredients/images/generation_1',
          url: 'https://cdn.genfeed.ai/generation_1.png',
        },
        provider: 'genfeedai',
      });

      expect(webhookDispatchService.dispatch).toHaveBeenCalledWith(
        'org_123',
        {
          event: 'generation.completed',
          eventId: `generation:generation.completed:${kind}:generation_1:completed`,
          generation: {
            brandId: 'brand_1',
            completedAt: '2026-07-07T10:00:00.000Z',
            error: null,
            id: 'generation_1',
            kind,
            model: 'flux-dev',
            output: {
              mimeType: 'image/png',
              storageKey: 'ingredients/images/generation_1',
              url: 'https://cdn.genfeed.ai/generation_1.png',
            },
            provider: 'genfeedai',
            status: 'completed',
          },
          occurredAt: '2026-07-07T10:00:00.000Z',
          schemaVersion: 1,
          timestamp: '2026-07-07T10:00:00.000Z',
        },
        expect.objectContaining({ jobIdPrefix: 'generation-webhook-' }),
      );
    },
  );

  it('normalizes an empty output to null', async () => {
    const { service, webhookDispatchService } = makeService();

    await service.emitGenerationCompleted({
      generationId: 'generation_1',
      kind: 'video',
      occurredAt,
      organizationId: 'org_123',
      output: { mimeType: null, storageKey: null, url: null },
    });

    expect(webhookDispatchService.dispatch).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        generation: expect.objectContaining({ output: null }),
      }),
      expect.anything(),
    );
  });

  it('classifies and redacts failure detail', async () => {
    const { service, webhookDispatchService } = makeService();

    await service.emitGenerationFailed({
      errorCode: 'provider_503 api_key=raw-code-key',
      errorMessage: 'Provider timeout 503 with api_key=raw-provider-key',
      generationId: 'generation_1',
      kind: 'image',
      occurredAt,
      organizationId: 'org_123',
      retryable: true,
    });

    const payload = webhookDispatchService.dispatch.mock.calls[0][1];
    expect(payload).toMatchObject({
      event: 'generation.failed',
      eventId: 'generation:generation.failed:image:generation_1:failed',
      generation: {
        error: {
          class: 'provider_outage',
          code: 'provider_503 api_key=[REDACTED]',
          message: 'Provider timeout 503 with api_key=[REDACTED]',
          retryable: true,
        },
        output: null,
        status: 'failed',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('raw-provider-key');
    expect(JSON.stringify(payload)).not.toContain('raw-code-key');
  });

  it('skips emission when the organization or generation id is missing', async () => {
    const { logger, service, webhookDispatchService } = makeService();

    await service.emitGenerationCompleted({
      generationId: '',
      kind: 'article',
      organizationId: 'org_123',
    });

    expect(webhookDispatchService.dispatch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped generation webhook'),
      expect.objectContaining({ hasGenerationId: false }),
    );
  });

  it('never fails the generation when dispatch throws', async () => {
    const { logger, service, webhookDispatchService } = makeService();
    webhookDispatchService.dispatch.mockRejectedValue(
      new Error('Queue unavailable webhook_secret=raw-webhook-secret'),
    );

    await expect(
      service.emitGenerationCompleted({
        generationId: 'generation_1',
        kind: 'image',
        organizationId: 'org_123',
      }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to emit generation event'),
      expect.objectContaining({
        error: 'Queue unavailable webhook_secret=[REDACTED]',
        generationId: 'generation_1',
      }),
    );
  });
});
