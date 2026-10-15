import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { WorkflowUpscaleFundingService } from '@api/collections/workflows/services/workflow-upscale-funding.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const POOL = {
  creditsConfig: { amount: 7, reservationId: 'pool-1' },
  user: { id: 'user-1', organizationId: 'org-1' },
};

describe('WorkflowUpscaleFundingService', () => {
  const holdForService = vi.fn();
  const bindOutput = vi.fn();
  const releaseOutput = vi.fn();
  const releasePool = vi.fn();
  const quoteSnapshotByKey = vi.fn();
  const findFirst = vi.fn();
  const error = vi.fn();
  const getPresignedDownloadUrlForObjectKey = vi.fn();
  const service = new WorkflowUpscaleFundingService(
    {
      bindOutput,
      holdForService,
      releaseOutput,
      releasePool,
    } as unknown as GenerationBillingService,
    { quoteSnapshotByKey } as unknown as ModelCreditQuoteService,
    { ingredient: { findFirst } } as unknown as PrismaService,
    { error, warn: vi.fn() } as unknown as LoggerService,
    { getPresignedDownloadUrlForObjectKey } as unknown as FilesClientService,
    { isAuthorizedMediaDeliveryEnabled: false } as unknown as ConfigService,
  );
  const input = {
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
    organizationId: 'org-1',
    scale: '6x',
    source: {
      category: IngredientCategory.IMAGE,
      id: 'source-1',
      objectKey: 'source-key',
      storageKey: 'source-key',
      storageType: 'images',
    },
    targetFps: undefined,
    targetResolution: undefined,
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    holdForService.mockResolvedValue(POOL);
    getPresignedDownloadUrlForObjectKey.mockResolvedValue(
      'https://storage.test/issued-source',
    );
    quoteSnapshotByKey.mockResolvedValue({ credits: 7 });
    findFirst.mockResolvedValue({
      metadata: { duration: 12.5, height: 768, width: 1024 },
    });
  });

  describe('image upscale', () => {
    it('quotes the stored 1024x768 source at 6x as 6144x4608 output pixels', async () => {
      await service.fund(input);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'source-1', isDeleted: false, organizationId: 'org-1' },
        }),
      );
      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        {
          height: 4608,
          organizationId: 'org-1',
          outputs: 1,
          requests: 1,
          width: 6144,
        },
      );
    });

    it('holds the quoted credits for the image upscale and runs the priced factor', async () => {
      const funding = await service.fund(input);

      expect(holdForService).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          credits: 7,
          organizationId: 'org-1',
          source: ActivitySource.IMAGE_UPSCALE,
          userId: 'user-1',
        }),
      );
      expect(funding.model).toBe(MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE);
      expect(funding.providerInput).toEqual({ upscale_factor: '6x' });
    });

    it('prices the direct-endpoint default factor when the node has none', async () => {
      const funding = await service.fund({ ...input, scale: undefined });

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        expect.objectContaining({ height: 3072, width: 4096 }),
      );
      expect(funding.providerInput).toEqual({ upscale_factor: '4x' });
    });

    it.each([
      ['no stored size', { metadata: null }],
      ['a zero width', { metadata: { height: 768, width: 0 } }],
      ['a zero height', { metadata: { height: 0, width: 1024 } }],
      ['no ingredient', null],
    ])('refuses a source with %s before any hold', async (_name, row) => {
      findFirst.mockResolvedValue(row);

      await expect(service.fund(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
      expect(holdForService).not.toHaveBeenCalled();
    });

    it('refuses an unsupported upscale factor before any hold', async () => {
      await expect(
        service.fund({ ...input, scale: '8x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(holdForService).not.toHaveBeenCalled();
    });
  });

  describe('video upscale', () => {
    const video = { ...input, category: IngredientCategory.VIDEO };

    it('quotes the stored source length at the target resolution and frame rate', async () => {
      const funding = await service.fund({
        ...video,
        targetFps: 60,
        targetResolution: '4k',
      });

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        {
          duration: 12.5,
          organizationId: 'org-1',
          outputs: 1,
          requests: 1,
          selectors: { target_fps: 60, target_resolution: '4k' },
        },
      );
      expect(holdForService).toHaveBeenCalledWith(
        expect.objectContaining({ source: ActivitySource.VIDEO_UPSCALE }),
      );
      expect(funding.model).toBe(MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE);
      expect(funding.providerInput).toEqual({
        target_fps: 60,
        target_resolution: '4k',
      });
    });

    it('prices the direct-endpoint defaults of 1080p at 30 fps when the node has none', async () => {
      await service.fund(video);

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        expect.objectContaining({
          selectors: { target_fps: 30, target_resolution: '1080p' },
        }),
      );
    });

    it('reads a string frame rate from the node as the number it prices', async () => {
      await service.fund({ ...video, targetFps: '24' });

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        expect.objectContaining({
          selectors: { target_fps: 24, target_resolution: '1080p' },
        }),
      );
    });

    it.each([
      ['no stored length', { metadata: {} }],
      ['a zero length', { metadata: { duration: 0 } }],
      ['no ingredient', null],
    ])('refuses a source with %s before any hold', async (_name, row) => {
      findFirst.mockResolvedValue(row);

      await expect(service.fund(video)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
      expect(holdForService).not.toHaveBeenCalled();
    });

    it.each([
      ['an unsupported resolution', { targetResolution: '8k' }],
      ['an unsupported frame rate', { targetFps: 120 }],
    ])('refuses %s before any hold', async (_name, target) => {
      await expect(
        service.fund({ ...video, ...target }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(holdForService).not.toHaveBeenCalled();
    });
  });

  it('refuses an unpriced model instead of holding zero credits', async () => {
    quoteSnapshotByKey.mockResolvedValue({ credits: 0 });

    await expect(service.fund(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(holdForService).not.toHaveBeenCalled();
  });

  it('lets a tariff refusal through without a hold', async () => {
    quoteSnapshotByKey.mockRejectedValue(new Error('PRICING_UNAVAILABLE'));

    await expect(service.fund(input)).rejects.toThrow('PRICING_UNAVAILABLE');
    expect(holdForService).not.toHaveBeenCalled();
  });

  it('issues the source URL from the stored object before holding credits', async () => {
    const funding = await service.fund(input);

    expect(getPresignedDownloadUrlForObjectKey).toHaveBeenCalledWith(
      'source-key',
    );
    expect(funding.sourceUrl).toBe('https://storage.test/issued-source');
  });

  it('holds nothing when no URL can be issued for the source', async () => {
    getPresignedDownloadUrlForObjectKey.mockRejectedValue(
      new Error('storage down'),
    );

    await expect(service.fund(input)).rejects.toThrow('storage down');
    expect(holdForService).not.toHaveBeenCalled();
  });

  describe('funding handle', () => {
    it('binds the quoted credits to the output and returns the pool', async () => {
      const funding = await service.fund(input);

      await funding.bind('output-1');
      await funding.releasePool();

      expect(bindOutput).toHaveBeenCalledWith(POOL, {
        credits: 7,
        ingredientId: 'output-1',
      });
      expect(releasePool).toHaveBeenCalledWith(POOL);
    });

    it('releases the output hold on a definitive rejection', async () => {
      const funding = await service.fund(input);

      await funding.reject('output-1');

      expect(releaseOutput).toHaveBeenCalledWith('output-1', 'org-1');
    });

    it('logs and swallows a failed hold release so the dispatch error surfaces', async () => {
      releaseOutput.mockRejectedValue(new Error('release failed'));
      const funding = await service.fund(input);

      await expect(funding.reject('output-1')).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    });
  });
});
