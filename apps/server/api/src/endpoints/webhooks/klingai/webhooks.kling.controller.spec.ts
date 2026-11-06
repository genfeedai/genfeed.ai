import type { KlingAIWebhookPayloadDto } from '@api/endpoints/webhooks/dto/klingai-webhook-payload.dto';
import { KlingWebhookController } from '@api/endpoints/webhooks/klingai/webhooks.kling.controller';
import type { KlingWebhookService } from '@api/endpoints/webhooks/klingai/webhooks.kling.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('kling callback'),
  },
}));

const WEBHOOK_SECRET = 'kling-webhook-secret';

// No default value here: a JS default parameter is substituted for an
// explicit `undefined` argument too, which would silently defeat the
// "no token" tests below (they call this with `undefined` to build an
// unauthenticated request).
function tokenRequest(token?: string): Request {
  return {
    headers: {},
    query: token ? { token } : {},
  } as unknown as Request;
}

interface MediaWrite {
  category: IngredientCategory;
  externalId: string;
  provider: string;
  url: string;
}

describe('KlingWebhookController', () => {
  let configuredSecret: string | undefined;
  let mediaUrls: { imageUrls: string[]; videoUrls: string[] };
  let metadataCallbacks: KlingAIWebhookPayloadDto[];
  let metadataFailure: Error | undefined;
  let mediaWrites: MediaWrite[];
  let failures: Array<{ externalId: string; message: unknown }>;
  let logs: Array<{ level: string; message: string }>;
  let controller: KlingWebhookController;

  beforeEach(() => {
    configuredSecret = WEBHOOK_SECRET;
    mediaUrls = { imageUrls: [], videoUrls: [] };
    metadataCallbacks = [];
    metadataFailure = undefined;
    mediaWrites = [];
    failures = [];
    logs = [];

    const record =
      (level: string) =>
      (message: string): void => {
        logs.push({ level, message });
      };

    controller = new KlingWebhookController(
      {
        get: (key: string) =>
          key === 'KLINGAI_WEBHOOK_SECRET' ? configuredSecret : undefined,
      } as unknown as ConfigService,
      {
        error: record('error'),
        log: record('log'),
        warn: record('warn'),
      } as unknown as LoggerService,
      {
        extractMediaUrls: () => mediaUrls,
        handleCallback: async (payload: KlingAIWebhookPayloadDto) => {
          if (metadataFailure) {
            throw metadataFailure;
          }
          metadataCallbacks.push(payload);
        },
      } as unknown as KlingWebhookService,
      {
        handleFailedGeneration: async (
          externalId: string,
          message: unknown,
        ) => {
          failures.push({ externalId, message });
        },
        processMediaFromWebhook: async (
          provider: string,
          category: IngredientCategory,
          externalId: string,
          url: string,
        ) => {
          mediaWrites.push({ category, externalId, provider, url });
        },
      } as unknown as WebhooksService,
    );
  });

  it('records a failed task against its external id', async () => {
    const result = await controller.handleCallback(
      tokenRequest(WEBHOOK_SECRET),
      { task_id: '123', task_status: 'failed' },
    );

    expect(result).toEqual({
      message: 'Webhook processed successfully',
      success: true,
    });
    expect(failures).toEqual([
      { externalId: '123', message: 'Generation failed' },
    ]);
    expect(mediaWrites).toEqual([]);
  });

  it('hands a callback with custom_id to the metadata handler', async () => {
    const body = {
      custom_id: 'custom_123',
      task_id: '123',
      task_status: 'succeed',
    };

    await controller.handleCallback(tokenRequest(WEBHOOK_SECRET), body);

    expect(metadataCallbacks).toEqual([body]);
  });

  it('stores every image and video of a succeeded task', async () => {
    mediaUrls = {
      imageUrls: ['https://cdn.kling.ai/image.jpg'],
      videoUrls: ['https://cdn.kling.ai/video.mp4'],
    };

    await controller.handleCallback(tokenRequest(WEBHOOK_SECRET), {
      task_id: 'task_456',
      task_result: {},
      task_status: 'succeed',
    });

    expect(mediaWrites).toEqual([
      {
        category: IngredientCategory.IMAGE,
        externalId: 'task_456',
        provider: 'klingai',
        url: 'https://cdn.kling.ai/image.jpg',
      },
      {
        category: IngredientCategory.VIDEO,
        externalId: 'task_456',
        provider: 'klingai',
        url: 'https://cdn.kling.ai/video.mp4',
      },
    ]);
    expect(failures).toEqual([]);
  });

  it('warns when a succeeded task carries no media', async () => {
    await controller.handleCallback(tokenRequest(WEBHOOK_SECRET), {
      task_id: 'task_789',
      task_status: 'succeed',
    });

    expect(mediaWrites).toEqual([]);
    expect(logs).toContainEqual({
      level: 'warn',
      message:
        'KlingWebhookController kling callback succeeded but no media URLs detected',
    });
  });

  it('rethrows and logs when callback handling fails', async () => {
    metadataFailure = new Error('Processing failed');

    await expect(
      controller.handleCallback(tokenRequest(WEBHOOK_SECRET), {
        custom_id: 'cb_err',
        task_id: '456',
        task_status: 'failed',
      }),
    ).rejects.toThrow('Processing failed');

    expect(logs).toContainEqual({
      level: 'error',
      message: 'KlingWebhookController kling callback failed',
    });
    expect(failures).toEqual([]);
  });

  it('rejects a callback carrying no token', async () => {
    await expect(
      controller.handleCallback(tokenRequest(undefined), {
        custom_id: 'custom_123',
        task_id: '123',
        task_status: 'succeed',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(metadataCallbacks).toEqual([]);
    expect(mediaWrites).toEqual([]);
  });

  it('rejects every caller when no secret is configured', async () => {
    configuredSecret = undefined;

    // Fail closed: an unconfigured deployment must not expose this
    // @Public() job-completion handler to anonymous callers.
    await expect(
      controller.handleCallback(tokenRequest(WEBHOOK_SECRET), {
        custom_id: 'custom_123',
        task_id: '123',
        task_status: 'succeed',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(
      logs.some(
        (entry) =>
          entry.level === 'error' &&
          entry.message.includes('KLINGAI_WEBHOOK_SECRET'),
      ),
    ).toBe(true);
    expect(metadataCallbacks).toEqual([]);
  });

  it.each([
    ['array', []],
    ['null', null],
    ['string', 'invalid'],
    ['number', 42],
    ['boolean', false],
    ['undefined', undefined],
  ])('rejects callbacks with a %s body', async (_type, body) => {
    await expect(
      controller.handleCallback(
        tokenRequest(WEBHOOK_SECRET),
        body as unknown as KlingAIWebhookPayloadDto,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(metadataCallbacks).toEqual([]);
    expect(failures).toEqual([]);
  });
});
