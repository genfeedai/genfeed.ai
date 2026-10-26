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

  describe('PostHog activation capture', () => {
    function makeFunnelService(options?: {
      ingredient?: { category?: string; userId: string | null } | null;
      priorGenerationCount?: number;
    }) {
      const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
      const prisma = {
        ingredient: {
          count: vi.fn().mockResolvedValue(options?.priorGenerationCount ?? 0),
          findFirst: vi
            .fn()
            .mockResolvedValue(
              options?.ingredient === undefined
                ? { category: 'IMAGE', userId: 'user_1' }
                : options.ingredient,
            ),
        },
      };
      const funnelCaptureService = {
        capture: vi.fn().mockResolvedValue(undefined),
      };
      const service = new GenerationEventWebhookService(
        logger as unknown as LoggerService,
        {
          dispatch: vi.fn().mockResolvedValue(null),
        } as unknown as WebhookDispatchService,
        prisma as never,
        funnelCaptureService as never,
      );

      return { funnelCaptureService, logger, prisma, service };
    }

    // The fire-and-forget capture chain resolves on a later microtask than
    // `emitGenerationCompleted` itself.
    async function flushMicrotasks(): Promise<void> {
      await new Promise((resolve) => setImmediate(resolve));
    }

    it("captures generation_completed keyed by the ingredient's user, plus first_successful_generation for the org's first output", async () => {
      const { funnelCaptureService, prisma, service } = makeFunnelService();

      await service.emitGenerationCompleted({
        generationId: 'ingredient_1',
        kind: 'image',
        organizationId: 'org_1',
      });
      await flushMicrotasks();

      expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ingredient_1',
            isDeleted: false,
            organizationId: 'org_1',
          }),
        }),
      );
      expect(prisma.ingredient.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          category: { in: ['IMAGE', 'VIDEO'] },
          id: { not: 'ingredient_1' },
          isDeleted: false,
          organizationId: 'org_1',
        }),
      });
      expect(funnelCaptureService.capture.mock.calls.map(([c]) => c)).toEqual([
        {
          distinctId: 'user_1',
          event: 'generation_completed',
          organizationId: 'org_1',
          properties: {
            $groups: { organization: 'org_1' },
            generationType: 'image',
            outcome: 'success',
          },
        },
        {
          distinctId: 'user_1',
          event: 'first_successful_generation',
          organizationId: 'org_1',
          properties: {
            $groups: { organization: 'org_1' },
            generationType: 'image',
          },
        },
      ]);
    });

    it('skips first_successful_generation when the organization already has a generated output', async () => {
      const { funnelCaptureService, service } = makeFunnelService({
        priorGenerationCount: 4,
      });

      await service.emitGenerationCompleted({
        generationId: 'ingredient_2',
        kind: 'video',
        organizationId: 'org_1',
      });
      await flushMicrotasks();

      expect(funnelCaptureService.capture).toHaveBeenCalledTimes(1);
      expect(funnelCaptureService.capture).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'generation_completed' }),
      );
    });

    it('captures generation_completed but not first_successful_generation for a non image or video ingredient', async () => {
      const { funnelCaptureService, prisma, service } = makeFunnelService({
        ingredient: { category: 'VOICE', userId: 'user_1' },
      });

      await service.emitGenerationCompleted({
        generationId: 'ingredient_6',
        kind: 'image',
        organizationId: 'org_1',
      });
      await flushMicrotasks();

      expect(prisma.ingredient.count).toHaveBeenCalled();
      expect(funnelCaptureService.capture).toHaveBeenCalledTimes(1);
      expect(funnelCaptureService.capture).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'generation_completed' }),
      );
    });

    it('does not capture without an owning user, rather than inventing an identity', async () => {
      const { funnelCaptureService, prisma, service } = makeFunnelService({
        ingredient: { category: 'IMAGE', userId: null },
      });

      await service.emitGenerationCompleted({
        generationId: 'ingredient_3',
        kind: 'image',
        organizationId: 'org_1',
      });
      await flushMicrotasks();

      expect(prisma.ingredient.count).not.toHaveBeenCalled();
      expect(funnelCaptureService.capture).not.toHaveBeenCalled();
    });

    it('never fails the generation when the capture lookup throws', async () => {
      const { funnelCaptureService, logger, prisma, service } =
        makeFunnelService();
      prisma.ingredient.findFirst.mockRejectedValue(new Error('db down'));

      await expect(
        service.emitGenerationCompleted({
          generationId: 'ingredient_4',
          kind: 'image',
          organizationId: 'org_1',
        }),
      ).resolves.toBeUndefined();
      await flushMicrotasks();

      expect(funnelCaptureService.capture).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('generation funnel capture skipped'),
        expect.objectContaining({ generationId: 'ingredient_4' }),
      );
    });

    it('does not capture a failed generation', async () => {
      const { funnelCaptureService, service } = makeFunnelService();

      await service.emitGenerationFailed({
        generationId: 'ingredient_5',
        kind: 'image',
        organizationId: 'org_1',
      });
      await flushMicrotasks();

      expect(funnelCaptureService.capture).not.toHaveBeenCalled();
    });
  });
});
