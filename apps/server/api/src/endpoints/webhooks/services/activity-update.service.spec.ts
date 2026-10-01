import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ActivityKey, IngredientCategory } from '@genfeedai/contracts';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ActivityUpdateService', () => {
  let service: ActivityUpdateService;
  let activitiesService: {
    findGenerationActivity: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let websocketService: {
    publishBackgroundTaskUpdate: ReturnType<typeof vi.fn>;
  };

  const mockObjectId = 'test-object-id';

  beforeEach(async () => {
    activitiesService = {
      record: vi.fn().mockResolvedValue({ id: mockObjectId }),
      findGenerationActivity: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: mockObjectId }),
    };
    websocketService = {
      publishBackgroundTaskUpdate: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ActivityUpdateService,
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: ActivityRecorderService, useValue: activitiesService },
        { provide: NotificationsPublisherService, useValue: websocketService },
      ],
    }).compile();
    service = module.get(ActivityUpdateService);
  });

  describe('updateSuccessActivity', () => {
    const baseParams = {
      brandId: 'test-object-id',
      category: IngredientCategory.VIDEO,
      dbUserId: 'test-object-id',
      ingredientId: 'test-object-id',
      organizationId: 'test-object-id',
      userId: 'authProvider_abc',
      userRoom: 'user-authProvider_abc',
    };

    it('should update existing processing activity', async () => {
      const existingActivity = {
        id: mockObjectId,
        value: JSON.stringify({ ingredientId: 'old', type: 'generation' }),
      };
      activitiesService.findGenerationActivity.mockResolvedValue(
        existingActivity,
      );

      await service.updateSuccessActivity(baseParams);

      expect(activitiesService.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockObjectId }),
        expect.objectContaining({
          key: ActivityKey.VIDEO_GENERATED,
        }),
      );
    });

    it('reuses a finished row on repeated completion callbacks and preserves its timing', async () => {
      const value = {
        startedAt: '2026-09-08T18:52:06Z',
        completedAt: '2026-09-08T18:52:19Z',
        ingredientId: mockObjectId,
      };
      activitiesService.findGenerationActivity.mockResolvedValue({
        id: mockObjectId,
        key: ActivityKey.VIDEO_GENERATED,
        value: JSON.stringify(value),
      });
      await service.updateSuccessActivity(baseParams);
      await service.updateSuccessActivity(baseParams);
      expect(activitiesService.record).not.toHaveBeenCalled();
      expect(activitiesService.findGenerationActivity).toHaveBeenCalledWith(
        [ActivityKey.VIDEO_PROCESSING, ActivityKey.VIDEO_GENERATED],
        mockObjectId,
        mockObjectId,
        mockObjectId,
      );
      const mutation = activitiesService.update.mock.calls[0][1];
      expect(JSON.parse(mutation.value)).toMatchObject(value);
    });

    it('finishes a recovered generation on the failed row instead of creating another activity', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue({
        id: mockObjectId,
        key: ActivityKey.VIDEO_FAILED,
        value: JSON.stringify({
          startedAt: '2026-09-08T18:52:06Z',
          completedAt: '2026-09-08T18:52:19Z',
        }),
      });
      await service.updateSuccessActivity(baseParams);
      expect(activitiesService.record).not.toHaveBeenCalled();
      const value = JSON.parse(activitiesService.update.mock.calls[0][1].value);
      expect(value.startedAt).toBe('2026-09-08T18:52:06Z');
      expect(value.completedAt).not.toBe('2026-09-08T18:52:19Z');
    });

    it('should create new activity when no existing found', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateSuccessActivity(baseParams);

      expect(activitiesService.record).toHaveBeenCalled();
    });

    it('should publish background task update when userId available', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateSuccessActivity(baseParams);

      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 100,
          status: 'completed',
          userId: 'authProvider_abc',
        }),
      );
    });

    it('should handle reframe transformation', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        transformations: ['reframed'],
      });

      expect(activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_REFRAME_COMPLETED,
        }),
      );
    });

    it('should handle upscale transformation', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        transformations: ['upscaled'],
      });

      expect(activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_UPSCALE_COMPLETED,
        }),
      );
    });

    it('should handle image category', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        category: IngredientCategory.IMAGE,
      });

      expect(activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.IMAGE_GENERATED,
        }),
      );
    });

    it('should handle music category', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateSuccessActivity({
        ...baseParams,
        category: IngredientCategory.MUSIC,
      });

      expect(activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.MUSIC_GENERATED,
        }),
      );
    });

    it('should skip unsupported categories', async () => {
      await service.updateSuccessActivity({
        ...baseParams,
        category: 'unsupported',
      });

      expect(activitiesService.findGenerationActivity).not.toHaveBeenCalled();
      expect(activitiesService.record).not.toHaveBeenCalled();
    });

    it('should not publish websocket when userId is missing', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

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
      brandId: 'test-object-id',
      category: IngredientCategory.VIDEO,
      dbUserId: 'test-object-id',
      errorMessage: 'GPU timeout',
      ingredientId: 'test-object-id',
      organizationId: 'test-object-id',
      userId: 'authProvider_abc',
      userRoom: 'user-authProvider_abc',
    };

    it('should update existing processing activity with failure', async () => {
      const existingActivity = {
        id: mockObjectId,
        value: JSON.stringify({ ingredientId: 'old' }),
      };
      activitiesService.findGenerationActivity.mockResolvedValue(
        existingActivity,
      );

      await service.updateFailureActivity(baseParams);

      expect(activitiesService.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockObjectId }),
        expect.objectContaining({
          key: ActivityKey.VIDEO_FAILED,
        }),
      );
    });

    it('should create new failure activity when no existing found', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateFailureActivity(baseParams);

      expect(activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_FAILED,
        }),
      );
    });

    it('should publish failure event', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateFailureActivity(baseParams);

      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'GPU timeout',
          status: 'failed',
        }),
      );
    });

    it('should handle image failure', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

      await service.updateFailureActivity({
        ...baseParams,
        category: IngredientCategory.IMAGE,
      });

      expect(activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.IMAGE_FAILED,
        }),
      );
    });

    it('should use default error message', async () => {
      activitiesService.findGenerationActivity.mockResolvedValue(null);

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
