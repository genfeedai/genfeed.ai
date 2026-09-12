import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicGenerationNotificationsService } from '@api/collections/musics/services/music-generation-notifications.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';

describe('MusicGenerationNotificationsService', () => {
  const user = {
    id: 'auth-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;

  const createHarness = () => {
    const activitiesService = {
      create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    const failedGenerationService = {
      handleFailedMusicGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const musicsService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MusicGenerationNotificationsService(
      activitiesService as never,
      failedGenerationService as never,
      musicsService as never,
      websocketService as never,
    );
    return {
      activitiesService,
      failedGenerationService,
      musicsService,
      service,
      websocketService,
    };
  };

  describe('notifyGenerationStarted', () => {
    it('creates a MUSIC_PROCESSING activity and publishes a background task update', async () => {
      const { activitiesService, service, websocketService } = createHarness();

      await service.notifyGenerationStarted({
        brandId: 'brand-1',
        ingredientId: 'music-1',
        model: 'explicit-model',
        user,
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          entityId: 'music-1',
          entityModel: ActivityEntityModel.INGREDIENT,
          key: ActivityKey.MUSIC_PROCESSING,
          organizationId: 'org-1',
          source: ActivitySource.MUSIC_GENERATION,
          userId: 'user-1',
        }),
      );
      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        {
          activityId: 'activity-1',
          label: 'Music Generation',
          progress: 0,
          room: expect.any(String),
          status: 'processing',
          taskId: 'music-1',
          userId: 'auth-user-1',
        },
      );
    });
  });

  describe('notifyAdditionalOutputStarted', () => {
    it('creates an activity, publishes an update, and stamps the prompt id onto the ingredient', async () => {
      const { activitiesService, musicsService, service, websocketService } =
        createHarness();

      await service.notifyAdditionalOutputStarted({
        brandId: 'brand-1',
        ingredientId: 'music-2',
        promptId: 'prompt-1',
        user,
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'music-2',
          key: ActivityKey.MUSIC_PROCESSING,
        }),
      );
      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          resultId: 'music-2',
          status: 'processing',
          taskId: 'music-2',
        }),
      );
      expect(musicsService.patch).toHaveBeenCalledWith('music-2', {
        promptId: 'prompt-1',
      });
    });
  });

  describe('handleFailedGeneration', () => {
    it('delegates to FailedGenerationService with this.musicsService and a MUSIC_FAILED activity payload', async () => {
      const { failedGenerationService, musicsService, service } =
        createHarness();

      await service.handleFailedGeneration(
        user,
        'brand-1',
        'music-1',
        '/ws/music/music-1',
        'boom',
      );

      expect(
        failedGenerationService.handleFailedMusicGeneration,
      ).toHaveBeenCalledWith(
        musicsService,
        'music-1',
        '/ws/music/music-1',
        'auth-user-1',
        expect.any(String),
        expect.objectContaining({
          brandId: 'brand-1',
          key: ActivityKey.MUSIC_FAILED,
          organizationId: 'org-1',
          source: ActivitySource.MUSIC_GENERATION,
          userId: 'user-1',
          value: JSON.stringify({ error: 'boom', ingredientId: 'music-1' }),
        }),
      );
    });
  });
});
