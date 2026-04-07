import type {
  MediaFailedEvent,
  NotificationData,
  VideoCompleteEvent,
  VideoProgressEvent,
} from '@libs/interfaces/websockets.interface';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { getUserRoomName } from './room-name.util';

@Injectable()
export class WebSocketService {
  constructor(private readonly redisService: RedisService) {}

  private async publish<T extends object>(
    channel: string,
    payload: T,
  ): Promise<void> {
    await this.redisService.publish(
      channel,
      payload as Record<string, unknown>,
    );
  }

  private getRoom(userId: string, room?: string): string {
    return room ?? getUserRoomName(userId);
  }

  async publishVideoProgress(
    path: string,
    progress: number,
    userId: string,
    room?: string,
  ): Promise<void> {
    const payload: VideoProgressEvent = {
      path,
      progress,
      room: this.getRoom(userId, room),
      userId,
    };
    await this.publish('video-progress', payload);
  }

  async publishVideoComplete(
    path: string,
    result: unknown,
    userId: string,
    room?: string,
  ): Promise<void> {
    const payload: VideoCompleteEvent = {
      path,
      result,
      room: this.getRoom(userId, room),
      userId,
    };
    await this.publish('video-complete', payload);
  }

  async publishMediaFailed(
    path: string,
    error: string,
    userId: string,
    room?: string,
  ): Promise<void> {
    const payload: MediaFailedEvent = {
      error,
      path,
      room: this.getRoom(userId, room),
      userId,
    };
    await this.publish('media-failed', payload);
  }

  async publishNotification(
    notification: unknown,
    userId?: string,
    organizationId?: string,
  ): Promise<void> {
    const payload: NotificationData = {
      notification,
      organizationId,
      userId,
    };
    await this.publish('notifications', payload);
  }

  async publishIngredientStatus(
    ingredientId: string,
    status: string,
    userId: string,
    metadata?: unknown,
  ): Promise<void> {
    await this.publish('ingredient-status', {
      ingredientId,
      metadata,
      status,
      userId,
    });
  }

  async publishPostStatus(
    postId: string,
    status: string,
    userId: string,
    metadata?: unknown,
  ): Promise<void> {
    await this.publish('post-status', {
      metadata,
      postId,
      status,
      userId,
    });
  }

  async publishTrainingStatus(
    trainingId: string,
    status: string,
    userId: string,
    progress?: number | unknown,
  ): Promise<void> {
    await this.publish('training-status', {
      progress,
      status,
      trainingId,
      userId,
    });
  }

  async publishFileProcessing(
    jobId: string,
    type: string,
    status: string,
    userId: string,
    ingredientId: string,
    progress?: number | unknown,
  ): Promise<void> {
    await this.publish('file-processing', {
      ingredientId,
      jobId,
      progress,
      status,
      type,
      userId,
    });
  }
}
