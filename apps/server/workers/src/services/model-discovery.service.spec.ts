import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/enums', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/enums')>();

  return {
    ...actual,
    ModelCategory: {
      EMBEDDING: 'embedding',
      IMAGE: 'image',
      IMAGE_EDIT: 'image-edit',
      IMAGE_UPSCALE: 'image-upscale',
      MUSIC: 'music',
      TEXT: 'text',
      VIDEO: 'video',
      VIDEO_EDIT: 'video-edit',
      VIDEO_UPSCALE: 'video-upscale',
      VOICE: 'voice',
    },
  };
});

vi.mock('@libs/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// Stub only the margin calculation. Config imports other pricing exports, so a
// full module replacement would break unrelated transitive imports.
vi.mock('@genfeedai/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/pricing')>();

  return {
    ...actual,
    applyMargin: vi.fn((providerCostUsd: number) =>
      Math.max(2, Math.ceil(providerCostUsd / 0.3 / 0.01)),
    ),
  };
});

import type { ModelsService } from '@api/collections/models/services/models.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@workers/config/config.service';
import type { IModelDiscoveryInput } from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import type { ModelPricingService } from '@workers/services/model-pricing.service';

describe('ModelDiscoveryService', () => {
  let service: ModelDiscoveryService;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockModelsService: {
    findOne: ReturnType<typeof vi.fn>;
    findAllActive: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let mockModelPricingService: {
    estimateCost: ReturnType<typeof vi.fn>;
    estimateFromProviderCost: ReturnType<typeof vi.fn>;
    getKnownReplicateCost: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };

  const mockPricing = {
    cost: 25,
    costPerUnit: 5,
    minCost: 5,
    pricingType: 'per_megapixel',
  };

  beforeEach(() => {
    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockModelsService = {
      create: vi.fn(),
      findAllActive: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    mockModelPricingService = {
      estimateCost: vi.fn().mockReturnValue(mockPricing),
      estimateFromProviderCost: vi.fn().mockReturnValue({
        ...mockPricing,
        cost: 34,
      }),
      getKnownReplicateCost: vi.fn().mockReturnValue(null),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue('test-replicate-token'),
    };

    service = new ModelDiscoveryService(
      mockLoggerService as unknown as LoggerService,
      mockModelsService as unknown as ModelsService,
      mockModelPricingService as unknown as ModelPricingService,
      mockConfigService as unknown as ConfigService,
    );
  });

  describe('createDraftModel', () => {
    const modelInfo: IModelDiscoveryInput = {
      category: ModelCategory.IMAGE,
      description: 'A test image model',
      endpoint: 'acme-labs/test-model',
      name: 'test-model',
      owner: 'acme-labs',
      provider: ModelProvider.REPLICATE,
      providerUrl: 'https://replicate.com/acme-labs/test-model',
      versionId: null,
    };

    it('should return null if model already exists', async () => {
      mockModelsService.findOne.mockResolvedValue({ id: 'existing' });

      const result = await service.createDraftModel(modelInfo);

      expect(result).toBeNull();
      expect(mockModelsService.create).not.toHaveBeenCalled();
    });

    it('should create draft model when it does not exist', async () => {
      const draftDoc = { id: 'draft-id', key: 'acme-labs/test-model' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      const result = await service.createDraftModel(modelInfo);

      expect(result).toBe(draftDoc);
      expect(mockModelsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'acme-labs/test-model',
          isActive: false,
          isDefault: false,
          isDiscovered: true,
          key: 'acme-labs/test-model',
          reviewStatus: 'pending',
        }),
      );
      expect(mockModelsService.findOne).toHaveBeenCalledWith({
        endpoint: 'acme-labs/test-model',
        provider: ModelProvider.REPLICATE,
      });
    });

    it('creates a collision-safe key for a Fal partner endpoint', async () => {
      const draftDoc = {
        id: 'fal-draft',
        key: 'fal/google/nano-banana-2-lite',
      };
      mockModelsService.create.mockResolvedValue(draftDoc);

      await service.createDraftModel({
        category: ModelCategory.IMAGE,
        description: 'Fal partner image endpoint',
        endpoint: 'google/nano-banana-2-lite',
        name: 'nano-banana-2-lite',
        owner: 'google',
        provider: ModelProvider.FAL,
        providerUrl: 'https://fal.ai/models/google/nano-banana-2-lite',
        versionId: null,
      });

      expect(mockModelsService.findOne).toHaveBeenCalledWith({
        endpoint: 'google/nano-banana-2-lite',
        provider: ModelProvider.FAL,
      });
      expect(mockModelsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'google/nano-banana-2-lite',
          key: 'fal/google/nano-banana-2-lite',
          provider: ModelProvider.FAL,
        }),
      );
    });

    it('uses provider cost pricing when a provider cost is available', async () => {
      const draftDoc = { id: 'draft-id' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      await service.createDraftModel({
        ...modelInfo,
        providerCostUsd: 0.1,
      });

      expect(
        mockModelPricingService.estimateFromProviderCost,
      ).toHaveBeenCalledWith(0.1, ModelCategory.IMAGE);
      expect(mockModelsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cost: 34,
          margin: 0.7,
          providerCostUsd: 0.1,
        }),
      );
    });

    it('should patch model with pricing after creation', async () => {
      const draftDoc = { id: 'draft-id' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      await service.createDraftModel(modelInfo);

      expect(mockModelsService.patch).toHaveBeenCalledWith(
        'draft-id',
        expect.objectContaining({ pricingType: mockPricing.pricingType }),
      );
    });

    it('should return null on creation error', async () => {
      mockModelsService.create.mockRejectedValue(new Error('DB error'));

      const result = await service.createDraftModel(modelInfo);

      expect(result).toBeNull();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should build label from owner/name in title case', async () => {
      const draftDoc = { id: 'x' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      await service.createDraftModel({
        ...modelInfo,
        name: 'flux-2-pro',
        owner: 'black-forest-labs',
      });

      const createCall = mockModelsService.create.mock.calls[0][0];
      expect(createCall.label).toBe('Flux 2 Pro');
    });
  });

  describe('detectCategory', () => {
    it('should return VIDEO when output schema describes video', () => {
      const schema = {
        components: {
          schemas: {
            Output: {
              description: 'output video file',
              format: 'uri',
              type: 'string',
            },
          },
        },
      };

      const result = service.detectCategory(schema, '');

      expect(result).toBe(ModelCategory.VIDEO);
    });

    it('should return IMAGE when output is array of URIs', () => {
      const schema = {
        components: {
          schemas: {
            Output: {
              items: { format: 'uri' },
              type: 'array',
            },
          },
        },
      };

      const result = service.detectCategory(schema, '');

      expect(result).toBe(ModelCategory.IMAGE);
    });

    it('should detect MUSIC from description keywords', () => {
      const result = service.detectCategory({}, 'A music generation model');

      expect(result).toBe(ModelCategory.MUSIC);
    });

    it('should detect VIDEO from description keywords', () => {
      const result = service.detectCategory({}, 'Generate video from text');

      expect(result).toBe(ModelCategory.VIDEO);
    });

    it('should detect TEXT from combined schema text', () => {
      const schema = {
        properties: {
          prompt: { description: 'Chat completion prompt for llm' },
        },
      };

      const result = service.detectCategory(schema, '');

      expect(result).toBe(ModelCategory.TEXT);
    });

    it('should default to IMAGE when no category can be detected', () => {
      const result = service.detectCategory({}, '');

      expect(result).toBe(ModelCategory.IMAGE);
    });

    it('should handle errors in schema parsing and return IMAGE', () => {
      // Circular reference or similar that causes stringify to fail
      const schema = null as unknown as Record<string, unknown>;

      const result = service.detectCategory(schema, '');

      expect(result).toBe(ModelCategory.IMAGE);
    });

    it('should detect VOICE from description', () => {
      const result = service.detectCategory({}, 'text-to-speech voice cloning');

      expect(result).toBe(ModelCategory.VOICE);
    });
  });

  describe('fetchReplicateSchema', () => {
    it('should return null when REPLICATE_KEY is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = await service.fetchReplicateSchema('owner', 'name', 'v1');

      expect(result).toBeNull();
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should return null on fetch error', async () => {
      // Patch global fetch to throw
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('Network timeout'));

      const result = await service.fetchReplicateSchema(
        'owner',
        'model',
        'ver1',
      );

      expect(result).toBeNull();
      expect(mockLoggerService.error).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('should return null on non-OK response', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const result = await service.fetchReplicateSchema(
        'owner',
        'model',
        'ver2',
      );

      expect(result).toBeNull();
      fetchSpy.mockRestore();
    });

    it('should return parsed data on successful fetch', async () => {
      const mockData = { id: 'ver1', openapi_schema: {} };
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockData),
        ok: true,
      } as unknown as Response);

      const result = await service.fetchReplicateSchema(
        'acme',
        'model',
        'ver1',
      );

      expect(result).toEqual(mockData);
      fetchSpy.mockRestore();
    });
  });

  describe('fetchReplicateModel', () => {
    it('fetches the exact model endpoint for registry synchronization', async () => {
      const mockData = {
        latest_version: { id: 'version-1', openapi_schema: {} },
        name: 'imagen-4',
        owner: 'google',
      };
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockData),
        ok: true,
      } as unknown as Response);

      await expect(
        service.fetchReplicateModel('google', 'imagen-4'),
      ).resolves.toEqual(mockData);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.replicate.com/v1/models/google/imagen-4',
        expect.objectContaining({ method: 'GET' }),
      );
      fetchSpy.mockRestore();
    });

    it('returns null without leaking an upstream response body', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(
        service.fetchReplicateModel('google', 'missing'),
      ).resolves.toBeNull();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Replicate API returned 404'),
      );
      fetchSpy.mockRestore();
    });
  });
});
