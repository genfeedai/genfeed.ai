import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import type {
  IBackgroundTaskUpdatePayload,
  IMediaResult,
  INotificationData,
} from '@genfeedai/interfaces';
import { Status } from '@genfeedai/enums';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * NotificationsPublisherService
 *
 * This service replaces the WebSocket services in the API.
 * Instead of directly emitting WebSocket events, it publishes
 * events to Redis channels that the notifications service listens to.
 */
@Injectable()
export class NotificationsPublisherService {
  constructor(
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Publish video progress event
   */
  async publishVideoProgress(
    path: string,
    progress: number,
    userId: string,
    room?: string,
  ) {
    await this.redisService.publish('video-progress', {
      path,
      progress,
      room,
      userId,
    });
  }

  /**
   * Publish media status event (complete or failed)
   */
  async publishMediaStatus(
    path: string,
    status: Status.COMPLETED | Status.FAILED,
    data: IMediaResult | string | Error,
    userId: string,
    room?: string,
  ) {
    const channel =
      status === Status.COMPLETED ? 'video-complete' : 'media-failed';
    const payload =
      status === Status.COMPLETED
        ? { path, result: data, room, userId }
        : { error: data, path, room, userId };

    await this.redisService.publish(channel, payload);

    await this.maybeSendVideoStatusEmail({
      error:
        status === Status.FAILED
          ? data instanceof Error
            ? data.message
            : String(data)
          : undefined,
      path,
      status: status === Status.COMPLETED ? 'completed' : 'failed',
      userId,
    });
  }

  /**
   * Publish video complete event
   */
  async publishVideoComplete(
    path: string,
    result: IMediaResult,
    userId: string,
    room?: string,
  ) {
    await this.publishMediaStatus(path, Status.COMPLETED, result, userId, room);
  }

  /**
   * Publish media failed event
   * Used for all media types: images, videos, music, avatars
   */
  async publishMediaFailed(
    path: string,
    error: string | Error,
    userId: string,
    room?: string,
  ) {
    await this.publishMediaStatus(path, Status.FAILED, error, userId, room);
  }

  /**
   * Publish notification event
   */
  async publishNotification(data: {
    userId?: string;
    organizationId?: string;
    notification: INotificationData;
  }) {
    await this.redisService.publish('notifications', data);
  }

  /**
   * Publish ingredient status event
   */
  async publishIngredientStatus(
    ingredientId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('ingredient-status', {
      ingredientId,
      metadata,
      status,
      userId,
    });
  }

  /**
   * Publish post status event
   */
  async publishPublicationStatus(
    postId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('post-status', {
      metadata,
      postId,
      status,
      userId,
    });
  }

  /**
   * Publish training status event
   */
  async publishTrainingStatus(
    trainingId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('training-status', {
      metadata,
      status,
      trainingId,
      userId,
    });
  }

  /**
   * Publish asset status event
   */
  async publishAssetStatus(
    assetId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('asset-status', {
      assetId,
      metadata,
      status,
      timestamp: new Date().toISOString(),
      userId,
    });
  }

  /**
   * Publish file processing event
   */
  async publishFileProcessing(
    jobId: string,
    type: string,
    status: string,
    userId: string,
    ingredientId: string,
    progress?: number,
  ) {
    await this.redisService.publish('file-processing', {
      ingredientId,
      jobId,
      progress,
      status,
      type,
      userId,
    });
  }

  /**
   * Publish job lifecycle event
   */
  async publishJobLifecycle(
    jobId: string,
    queueType: string,
    status: string,
    data: Record<string, unknown>,
  ) {
    await this.redisService.publish('job-lifecycle', {
      jobId,
      queueType,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Publish task status event
   */
  async publishTaskStatus(
    taskId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('task-status', {
      metadata,
      status,
      taskId,
      timestamp: new Date().toISOString(),
      userId,
    });
  }

  /**
   * Publish article status event
   */
  async publishArticleStatus(
    articleId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('article-status', {
      articleId,
      metadata,
      status,
      timestamp: new Date().toISOString(),
      userId,
    });
  }

  /**
   * Publish workflow status event
   */
  async publishWorkflowStatus(
    workflowId: string,
    status: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('workflow-status', {
      metadata,
      status,
      timestamp: new Date().toISOString(),
      userId,
      workflowId,
    });

    if (status === 'completed' || status === 'failed') {
      await this.maybeSendWorkflowStatusEmail({
        error:
          status === 'failed' && typeof metadata?.error === 'string'
            ? metadata.error
            : undefined,
        status,
        userId,
        workflowId,
        workflowLabel:
          typeof metadata?.workflowLabel === 'string'
            ? metadata.workflowLabel
            : workflowId,
      });
    }
  }

  /**
   * Publish brand refresh event
   * Used to notify frontend to refresh brand data (e.g., after logo/banner update)
   */
  async publishBrandRefresh(
    brandId: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.redisService.publish('brand-refresh', {
      brandId,
      metadata,
      timestamp: new Date().toISOString(),
      userId,
    });
  }

  /**
   * Publish background task update event
   * Used for real-time updates to activities dropdown (merges, generations, etc.)
   */
  async publishBackgroundTaskUpdate(
    data: Omit<IBackgroundTaskUpdatePayload, 'timestamp'>,
  ) {
    await this.redisService.publish('background-task-update', {
      activityId: data.activityId,
      currentPhase: data.currentPhase,
      error: data.error,
      estimatedDurationMs: data.estimatedDurationMs,
      etaConfidence: data.etaConfidence,
      label: data.label,
      lastEtaUpdateAt: data.lastEtaUpdateAt,
      progress: data.progress,
      remainingDurationMs: data.remainingDurationMs,
      resultId: data.resultId,
      resultType: data.resultType,
      room: data.room || `user-${data.userId}`,
      startedAt: data.startedAt,
      status: data.status,
      taskId: data.taskId,
      timestamp: new Date().toISOString(),
      userId: data.userId,
    });
  }

  /**
   * Generic emit method
   */
  async emit(path: string, data: unknown) {
    // For generic emits, we'll publish to a generic channel
    // The notifications service can handle routing based on the path
    await this.redisService.publish('generic-events', {
      data,
      path,
    });
  }

  private async getEmailNotificationContext(userId: string): Promise<{
    email: string | null;
    settings: Record<string, unknown> | null;
  }> {
    if (!Types.ObjectId.isValid(userId)) {
      return { email: null, settings: null };
    }

    const userObjectId = new Types.ObjectId(userId);
    const [user, settings] = await Promise.all([
      this.usersService.findOne({ _id: userObjectId, isDeleted: false }),
      this.settingsService.findOne({ isDeleted: false, user: userObjectId }),
    ]);

    return {
      email: typeof user?.email === 'string' ? user.email : null,
      settings: settings
        ? (settings as unknown as Record<string, unknown>)
        : null,
    };
  }

  private async maybeSendVideoStatusEmail(input: {
    status: 'completed' | 'failed';
    path: string;
    userId: string;
    error?: string;
  }): Promise<void> {
    const { email, settings } = await this.getEmailNotificationContext(
      input.userId,
    );

    if (!email || settings?.isVideoNotificationsEmail !== true) {
      return;
    }

    await this.notificationsService.sendVideoStatusEmail({
      error: input.error,
      path: input.path,
      status: input.status,
      to: email,
      url: 'https://app.genfeed.ai/content/videos',
      userId: input.userId,
    });
  }

  private async maybeSendWorkflowStatusEmail(input: {
    workflowId: string;
    workflowLabel: string;
    status: 'completed' | 'failed';
    userId: string;
    error?: string;
  }): Promise<void> {
    const { email, settings } = await this.getEmailNotificationContext(
      input.userId,
    );

    if (!email || settings?.isWorkflowNotificationsEmail !== true) {
      return;
    }

    await this.notificationsService.sendWorkflowStatusEmail({
      error: input.error,
      status: input.status,
      to: email,
      userId: input.userId,
      workflowId: input.workflowId,
      workflowLabel: input.workflowLabel,
    });
  }
}
