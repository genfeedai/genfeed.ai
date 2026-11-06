import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { Status } from '@genfeedai/contracts';
import type {
  IBackgroundTaskUpdatePayload,
  IMediaResult,
} from '@genfeedai/contracts/interfaces';
import type { RedisService } from '@libs/redis/redis.service';

describe('NotificationsPublisherService', () => {
  // Every message that reached a Redis channel, in order.
  let published: Array<{ channel: string; payload: unknown }>;
  let service: NotificationsPublisherService;

  beforeEach(() => {
    published = [];
    service = new NotificationsPublisherService({
      publish: async (channel: string, payload: unknown) => {
        published.push({ channel, payload });
        return 1;
      },
    } as unknown as RedisService);
  });

  const media = (url: string) => ({ url }) as unknown as IMediaResult;

  it.each([
    [
      'video progress',
      (s: NotificationsPublisherService) =>
        s.publishVideoProgress('/path', 50, 'user-1', 'room-1'),
      'video-progress',
      { path: '/path', progress: 50, room: 'room-1', userId: 'user-1' },
    ],
    [
      'video completion',
      (s: NotificationsPublisherService) =>
        s.publishVideoComplete(
          '/path',
          media('http://cdn.example.com/video.mp4'),
          'user-1',
        ),
      'video-complete',
      {
        path: '/path',
        result: { url: 'http://cdn.example.com/video.mp4' },
        room: undefined,
        userId: 'user-1',
      },
    ],
    [
      'a media failure',
      (s: NotificationsPublisherService) =>
        s.publishMediaFailed('/path', 'timeout error', 'user-1', 'room-1'),
      'media-failed',
      {
        error: 'timeout error',
        path: '/path',
        room: 'room-1',
        userId: 'user-1',
      },
    ],
    [
      'ingredient status',
      (s: NotificationsPublisherService) =>
        s.publishIngredientStatus('ing-1', 'completed', 'user-1', {
          extra: true,
        }),
      'ingredient-status',
      {
        ingredientId: 'ing-1',
        metadata: { extra: true },
        status: 'completed',
        userId: 'user-1',
      },
    ],
    [
      'training status',
      (s: NotificationsPublisherService) =>
        s.publishTrainingStatus('train-1', 'running', 'user-1'),
      'training-status',
      {
        metadata: undefined,
        status: 'running',
        trainingId: 'train-1',
        userId: 'user-1',
      },
    ],
    [
      'post publication status',
      (s: NotificationsPublisherService) =>
        s.publishPublicationStatus('post-1', 'published', 'user-1'),
      'post-status',
      {
        metadata: undefined,
        postId: 'post-1',
        status: 'published',
        userId: 'user-1',
      },
    ],
    [
      'a generic event',
      (s: NotificationsPublisherService) =>
        s.emit('custom/path', { foo: 'bar' }),
      'generic-events',
      { data: { foo: 'bar' }, path: 'custom/path' },
    ],
  ])(
    'publishes %s once on its channel',
    async (_label, act, channel, payload) => {
      await act(service);

      expect(published).toEqual([{ channel, payload }]);
    },
  );

  it('refreshes the bell only when there are in-app recipients', async () => {
    await service.publishInboxUpdate('org-1', []);
    await service.publishInboxUpdate('org-1', ['user-1']);

    expect(published).toEqual([
      {
        channel: 'notification-inbox',
        payload: { organizationId: 'org-1', userIds: ['user-1'] },
      },
    ]);
  });

  it('publishes a background task update with its ETA fields', async () => {
    const update = {
      activityId: 'act-1',
      currentPhase: 'Generating',
      estimatedDurationMs: 120000,
      etaConfidence: 'medium',
      label: 'Generating video',
      lastEtaUpdateAt: '2026-03-12T10:00:00.000Z',
      progress: 75,
      remainingDurationMs: 30000,
      startedAt: '2026-03-12T09:58:00.000Z',
      status: 'processing',
      taskId: 'task-1',
      userId: 'user-1',
    };

    await service.publishBackgroundTaskUpdate(
      update as unknown as Omit<IBackgroundTaskUpdatePayload, 'timestamp'>,
    );

    expect(published).toEqual([
      {
        channel: 'background-task-update',
        payload: expect.objectContaining(update),
      },
    ]);
  });

  it('stamps asset status with a timestamp', async () => {
    await service.publishAssetStatus('asset-1', 'ready', 'user-1');

    expect(published).toEqual([
      {
        channel: 'asset-status',
        payload: expect.objectContaining({
          assetId: 'asset-1',
          status: 'ready',
          timestamp: expect.any(String),
          userId: 'user-1',
        }),
      },
    ]);
  });

  it('routes a COMPLETED media status to the completion channel once', async () => {
    const result = media('http://cdn.example.com/img.png');

    await service.publishMediaStatus(
      '/path',
      Status.COMPLETED,
      result,
      'user-1',
    );

    expect(published).toEqual([
      {
        channel: 'video-complete',
        payload: expect.objectContaining({ result }),
      },
    ]);
  });
});
