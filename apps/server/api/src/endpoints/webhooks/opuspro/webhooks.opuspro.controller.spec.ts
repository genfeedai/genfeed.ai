import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OpusProWebhookController } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.controller';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import type { MicroservicesService } from '@api/services/microservices/microservices.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

const WEBHOOK_SECRET = 'opuspro-webhook-secret';

interface MetadataRow {
  error?: string | null;
  id: string;
  result?: string;
}

// No default value: a default would also replace an explicit `undefined`,
// defeating the "no token" case.
function tokenRequest(token?: string): Request {
  return {
    headers: {},
    query: token ? { token } : {},
  } as unknown as Request;
}

const payload = (fields: Partial<OpusProWebhookPayload>) =>
  fields as OpusProWebhookPayload;

describe('OpusProWebhookController', () => {
  // What a callback leaves behind: the metadata row, the notifications sent,
  // the media imported, the generations failed and the errors logged.
  let metadata: Map<string, MetadataRow>;
  let notified: string[];
  let imported: [string, string, string, string][];
  let failed: [string, string][];
  let errors: string[];
  let configuredSecret: string | undefined;
  let importFailure: Error | undefined;
  let controller: OpusProWebhookController;

  beforeEach(() => {
    metadata = new Map([['callback_1', { id: 'callback_1' }]]);
    notified = [];
    imported = [];
    failed = [];
    errors = [];
    configuredSecret = WEBHOOK_SECRET;
    importFailure = undefined;

    const logger = {
      error: (message: string) => {
        errors.push(message);
      },
      log: () => undefined,
      warn: () => undefined,
    } as unknown as LoggerService;

    const opusPro = new OpusProWebhookService(
      logger,
      {
        findOneSelect: async ({ id }: { id: string }) => {
          const row = metadata.get(id);
          return row ? { id: row.id } : null;
        },
        patch: async (id: string, update: Partial<MetadataRow>) =>
          Object.assign(metadata.get(id) as MetadataRow, update),
      } as unknown as MetadataService,
      {
        notifyWebhook: async (_provider: string, status: string) => {
          notified.push(status);
        },
      } as unknown as MicroservicesService,
    );

    controller = new OpusProWebhookController(
      { get: () => configuredSecret } as unknown as ConfigService,
      logger,
      opusPro,
      {
        handleFailedGeneration: async (id: string, message: string) => {
          failed.push([id, message]);
        },
        processMediaFromWebhook: async (
          provider: string,
          category: string,
          id: string,
          url: string,
        ) => {
          if (importFailure) throw importFailure;
          imported.push([provider, category, id, url]);
        },
      } as unknown as WebhooksService,
    );
  });

  const deliver = (fields: Partial<OpusProWebhookPayload>) =>
    controller.handleCallback(tokenRequest(WEBHOOK_SECRET), payload(fields));

  it('imports a completed video and records it on the metadata row', async () => {
    const result = await deliver({
      callback_id: 'callback_1',
      status: 'completed',
      videoUrl: 'https://cdn.opuspro.ai/video123.mp4',
    });

    expect(result).toEqual({ detail: 'Webhook received' });
    expect(imported).toEqual([
      [
        'opuspro',
        IngredientCategory.VIDEO,
        'callback_1',
        'https://cdn.opuspro.ai/video123.mp4',
      ],
    ]);
    expect(metadata.get('callback_1')).toEqual({
      error: null,
      id: 'callback_1',
      result: 'https://cdn.opuspro.ai/video123.mp4',
    });
    expect(failed).toEqual([]);
  });

  it.each([
    [
      'the provider error',
      'Video generation timeout',
      'Video generation timeout',
    ],
    ['a default message', undefined, 'Opus Pro generation failed'],
  ])('fails the generation with %s', async (_case, error, expected) => {
    await deliver({ callback_id: 'callback_1', error, status: 'failed' });

    expect(failed).toEqual([['callback_1', expected]]);
    expect(metadata.get('callback_1')).toEqual({
      error: expected,
      id: 'callback_1',
    });
    expect(imported).toEqual([]);
  });

  it.each([
    [
      'a processing update',
      { callback_id: 'callback_1', status: 'processing' },
      ['processing'],
    ],
    [
      'a completed render without a video',
      { callback_id: 'callback_1', status: 'completed' },
      ['completed'],
    ],
    [
      'a callback without an id',
      { status: 'completed', videoUrl: 'https://cdn.opuspro.ai/x.mp4' },
      [],
    ],
  ])(
    'acknowledges %s without importing or failing anything',
    async (_case, fields, expectedNotifications) => {
      await expect(deliver(fields)).resolves.toEqual({
        detail: 'Webhook received',
      });

      expect(notified).toEqual(expectedNotifications);
      expect(imported).toEqual([]);
      expect(failed).toEqual([]);
      expect(metadata.get('callback_1')).toEqual({ id: 'callback_1' });
    },
  );

  it.each([
    ['array', []],
    ['null', null],
    ['string', 'invalid'],
    ['number', 42],
    ['boolean', false],
    ['undefined', undefined],
  ])('rejects a %s body', async (_type, body) => {
    await expect(
      controller.handleCallback(
        tokenRequest(WEBHOOK_SECRET),
        body as unknown as OpusProWebhookPayload,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(notified).toEqual([]);
  });

  it('logs and rethrows when importing the media fails', async () => {
    importFailure = new Error('Webhook service failed');

    await expect(
      deliver({
        callback_id: 'callback_1',
        status: 'completed',
        videoUrl: 'https://cdn.opuspro.ai/video.mp4',
      }),
    ).rejects.toThrow('Webhook service failed');

    expect(errors).toEqual([
      expect.stringContaining('OpusProWebhookController'),
    ]);
  });

  it('rejects a callback carrying no token', async () => {
    await expect(
      controller.handleCallback(
        tokenRequest(undefined),
        payload({ callback_id: 'callback_1', status: 'failed' }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(failed).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('rejects every caller when no secret is configured', async () => {
    configuredSecret = undefined;

    // Fail closed: an unconfigured deployment must not expose this
    // @Public() job-completion handler to anonymous callers.
    await expect(
      deliver({ callback_id: 'callback_1', status: 'failed' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(errors).toEqual([expect.stringContaining('OPUSPRO_WEBHOOK_SECRET')]);
    expect(failed).toEqual([]);
  });
});
