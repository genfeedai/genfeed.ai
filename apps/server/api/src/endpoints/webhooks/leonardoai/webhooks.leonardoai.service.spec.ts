import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import type { LeonardoAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Metadata {
  error?: string;
  id: string;
  patchCount: number;
  result?: string;
}

const callback = (
  fields: Partial<LeonardoAIWebhookPayload>,
): LeonardoAIWebhookPayload =>
  ({
    customId: 'metadata-1',
    data: null,
    generationId: 'gen-123',
    ...fields,
  }) as LeonardoAIWebhookPayload;

describe('LeonardoaiWebhookService', () => {
  let metadata: Map<string, Metadata>;
  let service: LeonardoaiWebhookService;

  beforeEach(() => {
    metadata = new Map([['metadata-1', { id: 'metadata-1', patchCount: 0 }]]);

    const metadataService = {
      findOneSelect: async (where: { id: string }) => {
        const row = metadata.get(where.id);
        return row ? { id: row.id } : null;
      },
      patch: async (id: string, data: Partial<Metadata>) => {
        const row = metadata.get(id);
        if (row) {
          Object.assign(row, data, { patchCount: row.patchCount + 1 });
        }
        return row;
      },
    } as unknown as MetadataService;
    const logger = {
      log: () => undefined,
      warn: () => undefined,
    } as unknown as LoggerService;

    service = new LeonardoaiWebhookService(logger, metadataService);
  });

  it('stores the first image URL of a completed generation', async () => {
    await service.handleCallback(
      callback({
        images: [
          { url: 'https://cdn.leonardo.ai/img1.png' },
          { url: 'https://cdn.leonardo.ai/img2.png' },
        ],
        status: 'COMPLETE',
      } as Partial<LeonardoAIWebhookPayload>),
    );

    expect(metadata.get('metadata-1')).toEqual({
      id: 'metadata-1',
      patchCount: 1,
      result: 'https://cdn.leonardo.ai/img1.png',
    });
  });

  it('stores the whole image list when the first image has no URL', async () => {
    const images = [{ id: 'img-1' }];

    await service.handleCallback(
      callback({
        images,
        status: 'COMPLETE',
      } as Partial<LeonardoAIWebhookPayload>),
    );

    expect(metadata.get('metadata-1')?.result).toBe(JSON.stringify(images));
  });

  it('records the failure of a failed generation', async () => {
    await service.handleCallback(callback({ status: 'FAILED' }));

    expect(metadata.get('metadata-1')).toEqual({
      error: 'Image generation failed',
      id: 'metadata-1',
      patchCount: 1,
    });
  });

  it.each([
    ['a generation still running', 'PROCESSING'],
    ['a completed generation without images', 'COMPLETE'],
  ])('touches no result or error for %s', async (_case, status) => {
    await service.handleCallback(callback({ status }));

    expect(metadata.get('metadata-1')).toEqual({
      id: 'metadata-1',
      patchCount: 1,
    });
  });

  it.each([
    ['no generation id', { generationId: undefined }],
    ['no custom id', { customId: undefined }],
    ['unknown metadata', { customId: 'metadata-missing' }],
  ])('ignores a callback with %s', async (_case, fields) => {
    await service.handleCallback(
      callback({
        ...fields,
        images: [{ url: 'https://cdn.leonardo.ai/img1.png' }],
        status: 'COMPLETE',
      } as Partial<LeonardoAIWebhookPayload>),
    );

    expect([...metadata.values()]).toEqual([
      { id: 'metadata-1', patchCount: 0 },
    ]);
  });
});
