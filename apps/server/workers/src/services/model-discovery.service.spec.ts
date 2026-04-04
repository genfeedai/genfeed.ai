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

vi.mock('@api/collections/models/schemas/model.schema', () => ({
  Model: { name: 'Model' },
}));

import { ModelCategory } from '@genfeedai/enums';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';

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
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue('test-replicate-token'),
    };

    service = new ModelDiscoveryService(
      mockLoggerService as any,
      mockModelsService as any,
      mockModelPricingService as any,
      mockConfigService as any,
    );
  });

  describe('createDraftModel', () => {
    const modelInfo = {
      category: ModelCategory.IMAGE,
      description: 'A test image model',
      name: 'test-model',
      owner: 'acme-labs',
      provider: 'replicate',
    };

    it('should return null if model already exists', async () => {
      mockModelsService.findOne.mockResolvedValue({ _id: 'existing' });

      const result = await service.createDraftModel(modelInfo as any);

      expect(result).toBeNull();
      expect(mockModelsService.create).not.toHaveBeenCalled();
    });

    it('should create draft model when it does not exist', async () => {
      const draftDoc = { _id: 'draft-id', key: 'acme-labs/test-model' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      const result = await service.createDraftModel(modelInfo as any);

      expect(result).toBe(draftDoc);
      expect(mockModelsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          isDefault: false,
          key: 'acme-labs/test-model',
        }),
      );
    });

    it('should patch model with pricing after creation', async () => {
      const draftDoc = { _id: 'draft-id' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      await service.createDraftModel(modelInfo as any);

      expect(mockModelsService.patch).toHaveBeenCalledWith(
        'draft-id',
        expect.objectContaining({ pricingType: mockPricing.pricingType }),
      );
    });

    it('should return null on creation error', async () => {
      mockModelsService.create.mockRejectedValue(new Error('DB error'));

      const result = await service.createDraftModel(modelInfo as any);

      expect(result).toBeNull();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should build label from owner/name in title case', async () => {
      const draftDoc = { _id: 'x' };
      mockModelsService.create.mockResolvedValue(draftDoc);

      await service.createDraftModel({
        ...modelInfo,
        name: 'flux-2-pro',
        owner: 'black-forest-labs',
      } as any);

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
});
