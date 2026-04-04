import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { IngredientStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MetadataLookupService', () => {
  let service: MetadataLookupService;
  let metadataService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let websocketService: { publishMediaFailed: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    metadataService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    ingredientsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    websocketService = {
      publishMediaFailed: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new MetadataLookupService(
      metadataService,
      ingredientsService,
      websocketService,
      loggerService,
    );
  });

  describe('findMetadataWithFallback', () => {
    it('should find metadata by externalId', async () => {
      const mockMetadata = { _id: 'meta-1', externalId: 'ext-123' };
      metadataService.findOne.mockResolvedValue(mockMetadata);

      const result = await service.findMetadataWithFallback('ext-123');

      expect(result).toEqual(mockMetadata);
      expect(metadataService.findOne).toHaveBeenCalledWith({
        externalId: 'ext-123',
        isDeleted: false,
      });
    });

    it('should fallback to base ID when indexed ID not found', async () => {
      const mockMetadata = { _id: 'meta-1', externalId: 'ext' };
      metadataService.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockMetadata);

      const result = await service.findMetadataWithFallback('ext_0');

      expect(result).toEqual(mockMetadata);
      expect(metadataService.findOne).toHaveBeenCalledTimes(2);
      expect(metadataService.findOne).toHaveBeenLastCalledWith({
        externalId: 'ext',
        isDeleted: false,
      });
    });

    it('should return null when no metadata found', async () => {
      metadataService.findOne.mockResolvedValue(null);

      const result = await service.findMetadataWithFallback('ext-123');

      expect(result).toBeNull();
    });

    it('should not try fallback when externalId has no underscore', async () => {
      metadataService.findOne.mockResolvedValue(null);

      const result = await service.findMetadataWithFallback('ext123');

      expect(result).toBeNull();
      expect(metadataService.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMetadataNotFound', () => {
    it('should publish websocket error if ingredient found', async () => {
      const mockMetadata = { _id: 'meta-1' };
      const mockIngredient = {
        _id: 'ing-1',
        user: { _id: 'user-1', clerkId: 'clerk-1' },
      };

      metadataService.findOne.mockResolvedValue(mockMetadata);
      ingredientsService.findOne.mockResolvedValue(mockIngredient);

      await service.handleMetadataNotFound('ext-123', 'video', 'url', 'test');

      expect(websocketService.publishMediaFailed).toHaveBeenCalled();
      expect(ingredientsService.patch).toHaveBeenCalledWith('ing-1', {
        status: IngredientStatus.FAILED,
      });
    });

    it('should not throw if no metadata found for search', async () => {
      metadataService.findOne.mockResolvedValue(null);

      await expect(
        service.handleMetadataNotFound('ext-123', 'video', 'url', 'test'),
      ).resolves.not.toThrow();
    });

    it('should handle errors gracefully', async () => {
      metadataService.findOne.mockRejectedValue(new Error('DB error'));

      await expect(
        service.handleMetadataNotFound('ext-123', 'video', 'url', 'test'),
      ).resolves.not.toThrow();

      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('lookupMetadataAndIngredient', () => {
    it('should return metadata and ingredient on success', async () => {
      const mockMetadata = { _id: 'meta-1' };
      const mockIngredient = { _id: 'ing-1', user: { _id: 'user-1' } };

      metadataService.findOne.mockResolvedValue(mockMetadata);
      metadataService.patch.mockResolvedValue(mockMetadata);
      ingredientsService.findOne.mockResolvedValue(mockIngredient);

      const result = await service.lookupMetadataAndIngredient(
        'ext-123',
        'video',
        'http://example.com/video.mp4',
        'test',
      );

      expect(result.metadata).toEqual(mockMetadata);
      expect(result.ingredient).toEqual(mockIngredient);
      expect(metadataService.patch).toHaveBeenCalledWith('meta-1', {
        result: 'http://example.com/video.mp4',
      });
    });

    it('should throw when metadata not found', async () => {
      metadataService.findOne.mockResolvedValue(null);

      await expect(
        service.lookupMetadataAndIngredient(
          'ext-123',
          'video',
          'http://example.com/video.mp4',
          'test',
        ),
      ).rejects.toThrow('Metadata not found');
    });

    it('should throw when ingredient not found', async () => {
      metadataService.findOne.mockResolvedValue({ _id: 'meta-1' });
      metadataService.patch.mockResolvedValue({});
      ingredientsService.findOne.mockResolvedValue(null);

      await expect(
        service.lookupMetadataAndIngredient(
          'ext-123',
          'video',
          'http://example.com/video.mp4',
          'test',
        ),
      ).rejects.toThrow('Ingredient not found');
    });
  });
});
