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
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface PoolRequest {
  creditsConfig: { amount: number; reservationId: string };
}

interface Quantities {
  duration?: number;
  height?: number;
  selectors?: { target_fps: number; target_resolution: string };
  width?: number;
}

/**
 * A test tariff over the quoted quantities: images by output megapixel,
 * videos by second, scaled by frame rate and resolution.
 */
const TARIFF: Record<string, (quantities: Quantities) => number> = {
  [MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE]: ({ height = 0, width = 0 }) =>
    Math.ceil((width * height) / 1_000_000),
  [MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE]: ({ duration = 0, selectors }) =>
    Math.ceil(
      duration *
        ((selectors?.target_fps ?? 30) / 30) *
        (selectors?.target_resolution === '4k' ? 4 : 1),
    ),
};

const image = {
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
const video = { ...image, category: IngredientCategory.VIDEO };

describe('WorkflowUpscaleFundingService', () => {
  // The stored sources, the storage bucket, and the wallet's holds.
  let sources: Row[];
  let objects: Map<string, string>;
  let pools: Row[];
  let boundOutputs: Row[];
  let releasedOutputs: string[];
  let releasedPools: string[];
  let warnings: string[];
  let errors: string[];
  let isStorageDown: boolean;
  let isCopyDown: boolean;
  let isTariffMissing: boolean;
  let tariffOverride: number | undefined;
  let isWalletDown: boolean;
  let service: WorkflowUpscaleFundingService;

  beforeEach(() => {
    sources = [
      {
        id: 'source-1',
        isDeleted: false,
        metadata: { duration: 12.5, height: 768, width: 1024 },
        organizationId: 'org-1',
      },
    ];
    objects = new Map([['source-key', 'stored bytes']]);
    pools = [];
    boundOutputs = [];
    releasedOutputs = [];
    releasedPools = [];
    warnings = [];
    errors = [];
    isStorageDown = false;
    isCopyDown = false;
    isTariffMissing = false;
    tariffOverride = undefined;
    isWalletDown = false;

    service = new WorkflowUpscaleFundingService(
      {
        bindOutput: async (request: PoolRequest, binding: Row) => {
          boundOutputs.push({
            ...binding,
            pool: request.creditsConfig.reservationId,
          });
        },
        holdForService: async (hold: Row): Promise<PoolRequest> => {
          pools.push(hold);
          return {
            creditsConfig: {
              amount: Number(hold.credits),
              reservationId: `pool-${pools.length}`,
            },
          };
        },
        releaseOutput: async (ingredientId: string) => {
          if (isWalletDown) throw new Error('release failed');
          releasedOutputs.push(ingredientId);
        },
        releasePool: async (request: PoolRequest) => {
          releasedPools.push(request.creditsConfig.reservationId);
        },
      } as unknown as GenerationBillingService,
      {
        quoteSnapshotByKey: async (model: string, quantities: Quantities) => {
          if (isTariffMissing) throw new Error('PRICING_UNAVAILABLE');
          return {
            credits: tariffOverride ?? TARIFF[model]?.(quantities) ?? 0,
          };
        },
      } as unknown as ModelCreditQuoteService,
      {
        ingredient: {
          findFirst: async ({ where }: { where: Row }) =>
            sources.find(
              (row) =>
                row.id === where.id &&
                row.organizationId === where.organizationId &&
                row.isDeleted === where.isDeleted,
            ) ?? null,
        },
      } as unknown as PrismaService,
      {
        error: (message: string) => {
          errors.push(message);
        },
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
      {
        copyInS3: async (from: string, to: string) => {
          if (isCopyDown) throw new Error('copy unavailable');
          objects.set(to, objects.get(from) ?? '');
        },
        getPresignedDownloadUrlForObjectKey: async (key: string) => {
          if (isStorageDown) throw new Error('storage down');
          if (!objects.has(key)) throw new Error(`No object ${key}`);
          return `https://storage.test/${key}`;
        },
      } as unknown as FilesClientService,
      { isAuthorizedMediaDeliveryEnabled: false } as unknown as ConfigService,
    );
  });

  describe('image upscale', () => {
    it.each([
      ['the requested 6x factor', '6x', 29, '6x'],
      ['the direct-endpoint 4x default without one', undefined, 13, '4x'],
    ])(
      'holds the stored source priced at %s and runs that factor',
      async (_case, scale, credits, factor) => {
        const funding = await service.fund({ ...image, scale });

        expect(pools).toEqual([
          {
            brandId: 'brand-1',
            credits,
            description: `Workflow image upscale - ${MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE}`,
            organizationId: 'org-1',
            source: ActivitySource.IMAGE_UPSCALE,
            userId: 'user-1',
          },
        ]);
        expect(funding).toMatchObject({
          model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
          providerInput: { upscale_factor: factor },
          sourceUrl: 'https://storage.test/source-key',
        });
      },
    );

    it.each([
      ['no stored size', { metadata: null }],
      ['a zero width', { metadata: { height: 768, width: 0 } }],
      ['a zero height', { metadata: { height: 0, width: 1024 } }],
      ['another organization', { organizationId: 'org-2' }],
    ])('refuses a source with %s before any hold', async (_case, fields) => {
      sources[0] = { ...sources[0], ...fields };

      await expect(service.fund(image)).rejects.toThrow(
        'The source image size is unknown, so this upscale cannot be priced.',
      );
      expect(pools).toEqual([]);
      expect(warnings).toEqual([
        'WorkflowUpscaleFundingService refused an upscale with no stored source size',
      ]);
    });

    it('refuses an unsupported upscale factor before any hold', async () => {
      await expect(service.fund({ ...image, scale: '8x' })).rejects.toThrow(
        'The upscale factor is not supported, so this upscale cannot be priced.',
      );
      expect(pools).toEqual([]);
    });
  });

  describe('video upscale', () => {
    it.each([
      [
        '4k at 60 fps',
        { targetFps: 60, targetResolution: '4k' },
        100,
        { target_fps: 60, target_resolution: '4k' },
      ],
      [
        'the direct-endpoint 1080p at 30 fps default',
        {},
        13,
        { target_fps: 30, target_resolution: '1080p' },
      ],
      [
        'a string frame rate read as a number',
        { targetFps: '24' },
        10,
        { target_fps: 24, target_resolution: '1080p' },
      ],
    ])(
      'holds the stored length priced at %s',
      async (_case, target, credits, providerInput) => {
        const funding = await service.fund({ ...video, ...target });

        expect(pools).toEqual([
          expect.objectContaining({
            credits,
            source: ActivitySource.VIDEO_UPSCALE,
          }),
        ]);
        expect(funding).toMatchObject({
          model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
          providerInput,
        });
      },
    );

    it('issues the provider an .mp4-named copy of the stored video', async () => {
      const funding = await service.fund(video);

      expect(objects.get('provider-inputs/videos/source-1.mp4')).toBe(
        'stored bytes',
      );
      expect(funding.sourceUrl).toBe(
        'https://storage.test/provider-inputs/videos/source-1.mp4',
      );
    });

    it('holds nothing when the video copy fails', async () => {
      isCopyDown = true;

      await expect(service.fund(video)).rejects.toThrow('copy unavailable');
      expect(pools).toEqual([]);
    });

    it.each([
      ['no stored length', { metadata: {} }],
      ['a zero length', { metadata: { duration: 0 } }],
      ['a deleted ingredient', { isDeleted: true }],
    ])('refuses a source with %s before any hold', async (_case, fields) => {
      sources[0] = { ...sources[0], ...fields };

      await expect(service.fund(video)).rejects.toThrow(
        'The source video length is unknown, so this upscale cannot be priced.',
      );
      expect(pools).toEqual([]);
    });

    it.each([
      ['an unsupported resolution', { targetResolution: '8k' }],
      ['an unsupported frame rate', { targetFps: 120 }],
    ])('refuses %s before any hold', async (_case, target) => {
      await expect(
        service.fund({ ...video, ...target }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pools).toEqual([]);
    });
  });

  it('refuses a model the tariff prices at nothing instead of holding zero credits', async () => {
    tariffOverride = 0;

    await expect(service.fund(image)).rejects.toThrow(
      `Pricing is unavailable for ${MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE}.`,
    );
    expect(pools).toEqual([]);
  });

  it.each([
    [
      'the tariff refuses',
      () => {
        isTariffMissing = true;
      },
      'PRICING_UNAVAILABLE',
    ],
    [
      'no URL can be issued for the source',
      () => {
        isStorageDown = true;
      },
      'storage down',
    ],
  ])('holds nothing when %s', async (_case, arrange, message) => {
    arrange();

    await expect(service.fund(image)).rejects.toThrow(message);
    expect(pools).toEqual([]);
  });

  describe('funding handle', () => {
    it('binds the quoted credits to the output and returns the pool', async () => {
      const funding = await service.fund(image);

      await funding.bind('output-1');
      await funding.releasePool();

      expect(boundOutputs).toEqual([
        { credits: 29, ingredientId: 'output-1', pool: 'pool-1' },
      ]);
      expect(releasedPools).toEqual(['pool-1']);
    });

    it('releases the output hold on a definitive rejection', async () => {
      const funding = await service.fund(image);

      await funding.reject('output-1');

      expect(releasedOutputs).toEqual(['output-1']);
    });

    it('logs and swallows a failed hold release so the dispatch error surfaces', async () => {
      const funding = await service.fund(image);
      isWalletDown = true;

      await expect(funding.reject('output-1')).resolves.toBeUndefined();
      expect(errors).toEqual([
        'WorkflowUpscaleFundingService output hold release failed',
      ]);
    });
  });
});
