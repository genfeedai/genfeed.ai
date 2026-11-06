import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import type { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

interface MetadataRow {
  error?: string | null;
  id: string;
  result?: string;
}

interface Notification {
  body: Record<string, unknown>;
  provider: string;
  status: string;
}

const payload = (fields: Partial<OpusProWebhookPayload>) =>
  fields as OpusProWebhookPayload;

describe('OpusProWebhookService', () => {
  // The metadata table, the notifications sent and the warnings logged.
  let metadata: Map<string, MetadataRow>;
  let notifications: Notification[];
  let warnings: string[];
  let errors: string[];
  let isNotifierDown: boolean;
  let isDatabaseDown: boolean;
  let service: OpusProWebhookService;

  beforeEach(() => {
    metadata = new Map([['meta_1', { id: 'meta_1' }]]);
    notifications = [];
    warnings = [];
    errors = [];
    isNotifierDown = false;
    isDatabaseDown = false;

    service = new OpusProWebhookService(
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
      {
        findOneSelect: async ({ id }: { id: string }) => {
          if (isDatabaseDown) throw new Error('DB write failed');
          const row = metadata.get(id);
          return row ? { id: row.id } : null;
        },
        patch: async (id: string, update: Partial<MetadataRow>) =>
          Object.assign(metadata.get(id) as MetadataRow, update),
      } as unknown as MetadataService,
      {
        notifyWebhook: async (
          provider: string,
          status: string,
          body: Record<string, unknown>,
        ) => {
          if (isNotifierDown) {
            throw new Error('Request failed with status code 404');
          }
          notifications.push({ body, provider, status });
        },
      } as unknown as MicroservicesService,
    );
  });

  describe('extractVideoUrl', () => {
    it.each([
      [
        'videoUrl',
        { videoUrl: 'https://cdn.opuspro.ai/video.mp4' },
        'https://cdn.opuspro.ai/video.mp4',
      ],
      [
        'video_url when videoUrl is absent',
        { video_url: 'https://cdn.opuspro.ai/video_url.mp4' },
        'https://cdn.opuspro.ai/video_url.mp4',
      ],
      [
        'videoUrl over video_url',
        {
          video_url: 'https://cdn.example.com/fallback.mp4',
          videoUrl: 'https://cdn.example.com/primary.mp4',
        },
        'https://cdn.example.com/primary.mp4',
      ],
      ['nothing without a url', { status: 'completed' }, undefined],
    ])('returns %s', (_case, fields, expected) => {
      expect(service.extractVideoUrl(payload(fields))).toBe(expected);
    });
  });

  describe('handleCallback', () => {
    it.each([
      ['array', []],
      ['null', null],
      ['string', 'invalid'],
      ['number', 42],
      ['boolean', false],
    ])('rejects a %s body without notifying', async (_type, body) => {
      await expect(
        service.handleCallback(body as unknown as OpusProWebhookPayload),
      ).rejects.toThrow(BadRequestException);

      expect(notifications).toEqual([]);
    });

    it('notifies the microservice of every payload with its callback metadata', async () => {
      await service.handleCallback(
        payload({ callback_id: 'meta_1', status: 'processing' }),
      );

      expect(notifications).toEqual([
        {
          body: {
            callback_id: 'meta_1',
            metadata: { callbackId: 'meta_1', timestamp: expect.any(String) },
            status: 'processing',
          },
          provider: 'opuspro',
          status: 'processing',
        },
      ]);
    });

    it.each([
      [
        'a completed render stores the video and clears the error',
        {
          status: 'completed',
          videoUrl: 'https://cdn.opuspro.ai/result.mp4',
        },
        {
          error: null,
          id: 'meta_1',
          result: 'https://cdn.opuspro.ai/result.mp4',
        },
      ],
      [
        'a completed render reads the snake_case video url',
        {
          status: 'completed',
          video_url: 'https://cdn.opuspro.ai/snake.mp4',
        },
        {
          error: null,
          id: 'meta_1',
          result: 'https://cdn.opuspro.ai/snake.mp4',
        },
      ],
      [
        'a failed render stores the provider error',
        { error: 'GPU timeout', status: 'failed' },
        { error: 'GPU timeout', id: 'meta_1' },
      ],
      [
        'a failed render without detail stores the default error',
        { status: 'failed' },
        { error: 'Opus Pro generation failed', id: 'meta_1' },
      ],
      [
        'a completed render without a url leaves the row alone',
        { status: 'completed' },
        { id: 'meta_1' },
      ],
      [
        'a processing update leaves the row alone',
        { status: 'processing' },
        { id: 'meta_1' },
      ],
    ])('%s', async (_case, fields, expected) => {
      await service.handleCallback(
        payload({ callback_id: 'meta_1', ...fields }),
      );

      expect(metadata.get('meta_1')).toEqual(expected);
    });

    it.each([
      ['no callback id', {}, 'no callback_id provided'],
      [
        'an unknown callback id',
        { callback_id: 'missing' },
        'metadata not found',
      ],
    ])('warns and writes nothing for %s', async (_case, fields, warning) => {
      await service.handleCallback(
        payload({ ...fields, error: 'boom', status: 'failed' }),
      );

      expect(metadata.get('meta_1')).toEqual({ id: 'meta_1' });
      expect(warnings).toEqual([expect.stringContaining(warning)]);
    });

    it('still finalizes the render when the notification call fails', async () => {
      isNotifierDown = true;

      await service.handleCallback(
        payload({ callback_id: 'meta_1', error: 'boom', status: 'failed' }),
      );

      expect(metadata.get('meta_1')).toEqual({ error: 'boom', id: 'meta_1' });
      expect(warnings).toEqual([
        expect.stringContaining('notification failed, continuing'),
      ]);
    });

    it('logs and rethrows a metadata lookup failure', async () => {
      isDatabaseDown = true;

      await expect(
        service.handleCallback(
          payload({ callback_id: 'meta_1', status: 'processing' }),
        ),
      ).rejects.toThrow('DB write failed');

      expect(errors).toEqual([expect.stringContaining('failed')]);
    });
  });
});
