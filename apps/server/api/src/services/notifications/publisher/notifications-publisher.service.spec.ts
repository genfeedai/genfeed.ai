import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { Status } from '@genfeedai/enums';
import type { RedisService } from '@libs/redis/redis.service';

describe('NotificationsPublisherService', () => {
  let service: NotificationsPublisherService;
  let redisService: { publish: ReturnType<typeof vi.fn> };
  let notificationsService: {
    sendVideoStatusEmail: ReturnType<typeof vi.fn>;
    sendWorkflowStatusEmail: ReturnType<typeof vi.fn>;
  };
  let settingsService: { findOne: ReturnType<typeof vi.fn> };
  let usersService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    redisService = { publish: vi.fn().mockResolvedValue(1) };
    notificationsService = {
      sendVideoStatusEmail: vi.fn().mockResolvedValue(undefined),
      sendWorkflowStatusEmail: vi.fn().mockResolvedValue(undefined),
    };
    settingsService = { findOne: vi.fn().mockResolvedValue(null) };
    usersService = { findOne: vi.fn().mockResolvedValue(null) };
    service = new NotificationsPublisherService(
      redisService as unknown as RedisService,
      notificationsService as never,
      settingsService as never,
      usersService as never,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('publishes video progress to Redis', async () => {
    await service.publishVideoProgress('/path', 50, 'user-1', 'room-1');
    expect(redisService.publish).toHaveBeenCalledWith('video-progress', {
      path: '/path',
      progress: 50,
      room: 'room-1',
      userId: 'user-1',
    });
  });

  it('publishes video complete with correct channel', async () => {
    const result = { url: 'http://cdn.example.com/video.mp4' };
    await service.publishVideoComplete('/path', result as never, 'user-1');
    expect(redisService.publish).toHaveBeenCalledWith('video-complete', {
      path: '/path',
      result,
      room: undefined,
      userId: 'user-1',
    });
  });

  it('publishes media failed with error', async () => {
    await service.publishMediaFailed(
      '/path',
      'timeout error',
      'user-1',
      'room-1',
    );
    expect(redisService.publish).toHaveBeenCalledWith('media-failed', {
      error: 'timeout error',
      path: '/path',
      room: 'room-1',
      userId: 'user-1',
    });
  });

  it('publishes notification event', async () => {
    const data = {
      notification: { message: 'test', type: 'info' },
      userId: 'user-1',
    };
    await service.publishNotification(data as never);
    expect(redisService.publish).toHaveBeenCalledWith('notifications', data);
  });

  it('publishes ingredient status', async () => {
    await service.publishIngredientStatus('ing-1', 'completed', 'user-1', {
      extra: true,
    });
    expect(redisService.publish).toHaveBeenCalledWith('ingredient-status', {
      ingredientId: 'ing-1',
      metadata: { extra: true },
      status: 'completed',
      userId: 'user-1',
    });
  });

  it('publishes training status', async () => {
    await service.publishTrainingStatus('train-1', 'running', 'user-1');
    expect(redisService.publish).toHaveBeenCalledWith('training-status', {
      metadata: undefined,
      status: 'running',
      trainingId: 'train-1',
      userId: 'user-1',
    });
  });

  it('publishes post status (publication status)', async () => {
    await service.publishPublicationStatus('post-1', 'published', 'user-1');
    expect(redisService.publish).toHaveBeenCalledWith('post-status', {
      metadata: undefined,
      postId: 'post-1',
      status: 'published',
      userId: 'user-1',
    });
  });

  it('publishes generic emit', async () => {
    await service.emit('custom/path', { foo: 'bar' });
    expect(redisService.publish).toHaveBeenCalledWith('generic-events', {
      data: { foo: 'bar' },
      path: 'custom/path',
    });
  });

  it('publishes background task update', async () => {
    await service.publishBackgroundTaskUpdate({
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
    } as never);
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({
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
      }),
    );
  });

  it('publishes asset status with timestamp', async () => {
    await service.publishAssetStatus('asset-1', 'ready', 'user-1');
    expect(redisService.publish).toHaveBeenCalledWith(
      'asset-status',
      expect.objectContaining({
        assetId: 'asset-1',
        status: 'ready',
        timestamp: expect.any(String),
        userId: 'user-1',
      }),
    );
  });

  it('publishes media status as COMPLETED', async () => {
    const result = { url: 'http://cdn.example.com/img.png' };
    await service.publishMediaStatus(
      '/path',
      Status.COMPLETED,
      result as never,
      'user-1',
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'video-complete',
      expect.objectContaining({
        result,
      }),
    );
  });

  it('sends video email when the user opted in', async () => {
    usersService.findOne.mockResolvedValue({ email: 'user@example.com' });
    settingsService.findOne.mockResolvedValue({
      isVideoNotificationsEmail: true,
    });

    await service.publishVideoComplete(
      '/path',
      { url: 'https://cdn' } as never,
      '507f1f77bcf86cd799439011',
    );

    expect(notificationsService.sendVideoStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/path',
        status: 'completed',
        to: 'user@example.com',
      }),
    );
  });

  it('sends workflow email when the user opted in', async () => {
    usersService.findOne.mockResolvedValue({ email: 'user@example.com' });
    settingsService.findOne.mockResolvedValue({
      isWorkflowNotificationsEmail: true,
    });

    await service.publishWorkflowStatus(
      'workflow-1',
      'failed',
      '507f1f77bcf86cd799439011',
      { error: 'boom', workflowLabel: 'My Flow' },
    );

    expect(notificationsService.sendWorkflowStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'boom',
        status: 'failed',
        to: 'user@example.com',
        workflowId: 'workflow-1',
        workflowLabel: 'My Flow',
      }),
    );
  });
});
