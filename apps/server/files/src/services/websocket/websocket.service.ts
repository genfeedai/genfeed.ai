import { ConfigService } from '@files/config/config.service';
import type { JobProgress } from '@files/shared/interfaces/job.interface';
import { Injectable, Logger } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);
  private redisPublisher!: RedisClientType;

  constructor(private configService: ConfigService) {
    this.initRedis().catch((error) => {
      this.logger.error('Failed to initialize Redis connection', error);
    });
  }

  private async initRedis() {
    try {
      const redisUrl =
        this.configService.get('REDIS_URL') || 'redis://localhost:6379';

      this.redisPublisher = createClient({ url: redisUrl });
      this.redisPublisher.on('error', (err) => {
        this.logger.error('Redis Publisher Error', err);
      });

      await this.redisPublisher.connect();
      this.logger.log('Connected to Redis for WebSocket publishing');
    } catch (error: unknown) {
      this.logger.error('Failed to connect to Redis', error);
      // Don't throw the error to prevent blocking the service startup
    }
  }

  async emitProgress(
    websocketUrl: string,
    progress: JobProgress,
    userId?: string,
    room?: string,
  ) {
    if (!this.redisPublisher || !this.redisPublisher.isOpen) {
      this.logger.warn('Redis not connected, skipping progress emission');
      return;
    }

    try {
      const message = {
        path: websocketUrl,
        progress,
        room: room || (userId ? `user-${userId}` : undefined),
        userId: userId || this.extractUserIdFromPath(websocketUrl),
      };

      await this.redisPublisher.publish(
        'video-progress',
        JSON.stringify(message),
      );
      this.logger.debug(
        `Published progress to Redis: ${websocketUrl} (room: ${message.room})`,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to emit progress to Redis', error);
    }
  }

  async emitSuccess(
    websocketUrl: string,
    result: unknown,
    userId?: string,
    room?: string,
  ) {
    if (!this.redisPublisher || !this.redisPublisher.isOpen) {
      this.logger.warn('Redis not connected, skipping success emission');
      return;
    }

    try {
      const message = {
        path: websocketUrl,
        result,
        room: room || (userId ? `user-${userId}` : undefined),
        userId: userId || this.extractUserIdFromPath(websocketUrl),
      };

      await this.redisPublisher.publish(
        'video-complete',
        JSON.stringify(message),
      );
      this.logger.log(
        `Published success to Redis: ${websocketUrl} (room: ${message.room})`,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to emit success to Redis', error);
    }
  }

  async emitError(
    websocketUrl: string,
    error: string,
    userId?: string,
    room?: string,
  ) {
    if (!this.redisPublisher || !this.redisPublisher.isOpen) {
      this.logger.warn('Redis not connected, skipping error emission');
      return;
    }

    try {
      const message = {
        error,
        path: websocketUrl,
        room: room || (userId ? `user-${userId}` : undefined),
        userId: userId || this.extractUserIdFromPath(websocketUrl),
      };

      await this.redisPublisher.publish(
        'media-failed',
        JSON.stringify(message),
      );
      this.logger.error(
        `Published error to Redis: ${websocketUrl} (room: ${message.room})`,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to emit error to Redis', error);
    }
  }

  async emitStatus(
    websocketUrl: string,
    status: string,
    data?: unknown,
    userId?: string,
  ) {
    if (!this.redisPublisher || !this.redisPublisher.isOpen) {
      this.logger.warn('Redis not connected, skipping status emission');
      return;
    }

    try {
      const message = {
        path: websocketUrl,
        status,
        userId: userId || this.extractUserIdFromPath(websocketUrl),
        ...data,
      };

      await this.redisPublisher.publish(
        'file-processing',
        JSON.stringify(message),
      );
      this.logger.debug(`Published status to Redis: ${websocketUrl}`);
    } catch (error: unknown) {
      this.logger.error('Failed to emit status to Redis', error);
    }
  }

  async sendProgress(ingredientId: string, progress: unknown) {
    if (!this.redisPublisher || !this.redisPublisher.isOpen) {
      this.logger.warn('Redis not connected, skipping progress emission');
      return;
    }

    try {
      const message = {
        ingredientId,
        ...progress,
      };

      await this.redisPublisher.publish(
        'job-progress',
        JSON.stringify(message),
      );
      this.logger.debug(`Published job progress: ${ingredientId}`);
    } catch (error: unknown) {
      this.logger.error('Failed to send progress to Redis', error);
    }
  }

  private extractUserIdFromPath(websocketUrl: string): string {
    return websocketUrl || 'unknown';
  }

  async disconnect() {
    if (this.redisPublisher?.isOpen) {
      try {
        await this.redisPublisher.quit();
        this.logger.log('Disconnected from Redis');
      } catch (error: unknown) {
        this.logger.error('Error disconnecting from Redis', error);
      }
    }
  }
}
