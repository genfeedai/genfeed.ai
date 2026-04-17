import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { ActivityKey, IngredientCategory } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ActivityUpdateService', () => {
  let service: ActivityUpdateService;
  let activitiesService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let websocketService: {
    publishBackgroundTaskUpdate: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockObjectId = new Types.ObjectId();

  beforeEach(() => {
    activitiesService = {
      create: vi.fn().mockResolvedValue({ _id: mockObjectId }),
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue({ _id: mockObjectId }),
    };
    websocketService = {
      publishBackgroundTaskUpdate: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new ActivityUpdateService(
      activitiesService,
      websocketService,
      loggerService,
    );
  });

  describe('updateSuccessActivity', () => {
    const baseParams = {
      brandId: new Types.ObjectId().toString(),
      category: IngredientCategory.VIDEO,
      dbUserId: new Types.ObjectId().toString(),
      ingredientId: new Types.ObjectId().toString(),
      organizationId: new Types.ObjectId().toString(),
      userId: 'clerk_abc',
      userRoom: 'user-clerk_abc',
    };

    it('should update existing processing activity', async () => {
      const existingActivity = {
        _id: mockObjectId,
        value: JSON.stringify({ ingredientId: 'old', type: 'generation' }),
      };
      activitiesService.findOne.mockResolvedValue(existingActivity);

      await service.updateSuccessActivity(baseParams);

      expect(activitiesService.patch).toHaveBeenCalledWith(
        mockObjectId.toString(),
        expect.objectContaining({
          key: ActivityKey.VIDEO_GENERATED,
        }),
      );
    });

    it('should create new activity when no existing found', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity(baseParams);

      expect(activitiesService.create).toHaveBeenCalled();
    });

    it('should publish background task update when userId available', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity(baseParams);

      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 100,
          status: 'completed',
          userId: 'clerk_abc',
        }),
      );
    });

    it('should handle reframe transformation', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        transformations: ['reframed'],
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_REFRAME_COMPLETED,
        }),
      );
    });

    it('should handle upscale transformation', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        transformations: ['upscaled'],
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_UPSCALE_COMPLETED,
        }),
      );
    });

    it('should handle image category', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        category: IngredientCategory.IMAGE,
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.IMAGE_GENERATED,
        }),
      );
    });

    it('should handle music category', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        category: IngredientCategory.MUSIC,
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.MUSIC_GENERATED,
        }),
      );
    });

    it('should skip unsupported categories', async () => {
      await service.updateSuccessActivity({
        ...baseParams,
        category: 'unsupported' as any,
      });

      expect(activitiesService.findOne).not.toHaveBeenCalled();
      expect(activitiesService.create).not.toHaveBeenCalled();
    });

    it('should not publish websocket when userId is missing', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        userId: undefined,
      });

      expect(
        websocketService.publishBackgroundTaskUpdate,
      ).not.toHaveBeenCalled();
    });
  });

  describe('updateFailureActivity', () => {
    const baseParams = {
      brandId: new Types.ObjectId().toString(),
      category: IngredientCategory.VIDEO,
      dbUserId: new Types.ObjectId().toString(),
      errorMessage: 'GPU timeout',
      ingredientId: new Types.ObjectId().toString(),
      organizationId: new Types.ObjectId().toString(),
      userId: 'clerk_abc',
      userRoom: 'user-clerk_abc',
    };

    it('should update existing processing activity with failure', async () => {
      const existingActivity = {
        _id: mockObjectId,
        value: JSON.stringify({ ingredientId: 'old' }),
      };
      activitiesService.findOne.mockResolvedValue(existingActivity);

      await service.updateFailureActivity(baseParams);

      expect(activitiesService.patch).toHaveBeenCalledWith(
        mockObjectId.toString(),
        expect.objectContaining({
          key: ActivityKey.VIDEO_FAILED,
        }),
      );
    });

    it('should create new failure activity when no existing found', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateFailureActivity(baseParams);

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_FAILED,
        }),
      );
    });

    it('should publish failure event', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateFailureActivity(baseParams);

      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'GPU timeout',
          status: 'failed',
        }),
      );
    });

    it('should handle image failure', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateFailureActivity({
        ...baseParams,
        category: IngredientCategory.IMAGE,
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.IMAGE_FAILED,
        }),
      );
    });

    it('should use default error message', async () => {
      activitiesService.findOne.mockResolvedValue(null);

      await service.updateFailureActivity({
        ...baseParams,
        errorMessage: undefined,
      });

      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Generation failed',
        }),
      );
    });
  });
});
