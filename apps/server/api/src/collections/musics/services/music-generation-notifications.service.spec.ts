import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicGenerationNotificationsService } from '@api/collections/musics/services/music-generation-notifications.service';
import type { MusicsService } from '@api/collections/musics/services/musics.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';

type Row = Record<string, unknown>;

describe('MusicGenerationNotificationsService', () => {
  const user = {
    id: 'auth-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;

  let activities: Row[];
  let published: Row[];
  let musics: Map<string, Row>;
  let failures: Row[];
  let service: MusicGenerationNotificationsService;

  beforeEach(() => {
    activities = [];
    published = [];
    musics = new Map([
      ['music-1', { status: 'processing' }],
      ['music-2', { status: 'processing' }],
    ]);
    failures = [];

    const musicsService = {
      patch: async (id: string, update: Row) => {
        musics.set(id, { ...musics.get(id), ...update });
      },
    } as unknown as MusicsService;

    service = new MusicGenerationNotificationsService(
      {
        record: async (activity: Row) => {
          activities.push(activity);
          return { id: `activity-${activities.length}` };
        },
      } as unknown as ActivityRecorderService,
      {
        // The real service marks the ingredient failed through the passed
        // collection service, records the activity and notifies the room.
        handleFailedMusicGeneration: async (
          collection: MusicsService,
          ingredientId: string,
          websocketPath: string,
          userId: string,
          room: string,
          activity: Row,
          error: string,
        ) => {
          await collection.patch(ingredientId, { status: 'failed' });
          failures.push({ activity, error, room, userId, websocketPath });
        },
      } as unknown as FailedGenerationService,
      musicsService,
      {
        publishBackgroundTaskUpdate: async (update: Row) => {
          published.push(update);
        },
      } as unknown as NotificationsPublisherService,
    );
  });

  it('records a processing activity for the first output and tells the user room', async () => {
    await service.notifyGenerationStarted({
      brandId: 'brand-1',
      ingredientId: 'music-1',
      model: 'explicit-model',
      user,
    });

    expect(activities).toEqual([
      {
        brandId: 'brand-1',
        entityId: 'music-1',
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MUSIC_PROCESSING,
        organizationId: 'org-1',
        source: ActivitySource.MUSIC_GENERATION,
        userId: 'user-1',
        value: JSON.stringify({
          ingredientId: 'music-1',
          model: 'explicit-model',
          type: 'generation',
        }),
      },
    ]);
    expect(published).toEqual([
      {
        activityId: 'activity-1',
        label: 'Music Generation',
        progress: 0,
        room: getUserRoomName('auth-user-1'),
        status: 'processing',
        taskId: 'music-1',
        userId: 'auth-user-1',
      },
    ]);
  });

  it('records an additional output and stamps the shared prompt onto it', async () => {
    await service.notifyAdditionalOutputStarted({
      brandId: 'brand-1',
      ingredientId: 'music-2',
      promptId: 'prompt-1',
      user,
    });

    expect(activities).toEqual([
      expect.objectContaining({
        entityId: 'music-2',
        key: ActivityKey.MUSIC_PROCESSING,
        userId: 'user-1',
      }),
    ]);
    expect(published).toEqual([
      {
        activityId: 'activity-1',
        label: 'Music generation',
        resultId: 'music-2',
        status: 'processing',
        taskId: 'music-2',
        userId: 'user-1',
      },
    ]);
    expect(musics.get('music-2')).toEqual({
      promptId: 'prompt-1',
      status: 'processing',
    });
  });

  it('marks the music failed with a MUSIC_FAILED activity in the user room', async () => {
    await service.handleFailedGeneration(
      user,
      'brand-1',
      'music-1',
      '/ws/music/music-1',
      'boom',
    );

    expect(musics.get('music-1')).toEqual({ status: 'failed' });
    expect(failures).toEqual([
      {
        activity: {
          brandId: 'brand-1',
          key: ActivityKey.MUSIC_FAILED,
          organizationId: 'org-1',
          source: ActivitySource.MUSIC_GENERATION,
          userId: 'user-1',
          value: JSON.stringify({ error: 'boom', ingredientId: 'music-1' }),
        },
        error: 'boom',
        room: getUserRoomName('auth-user-1'),
        userId: 'auth-user-1',
        websocketPath: '/ws/music/music-1',
      },
    ]);
  });
});
