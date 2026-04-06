import { EventEmitter } from 'node:events';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import {
  buildNodeRedisSocketOptions,
  parseRedisConnection,
} from './redis-connection.utils';

@Injectable()
export class RedisService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly context = { service: RedisService.name };
  private publisher!: RedisClientType;
  private subscriber!: RedisClientType;
  private handlers: Map<string, ((message: unknown) => void)[]> = new Map();
  private isInitialized = false;
  private pendingSubscriptions: Array<{
    channel: string;
    handler?: (message: unknown) => void;
  }> = [];

  constructor(
    @Inject('ConfigService')
    private readonly configService: {
      get: (key: string) => string | undefined;
    }, // App-specific ConfigService
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async onModuleInit() {
    const redisUrl = this.configService.get('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL not configured - Redis features disabled',
        this.context,
      );
      return;
    }

    const config = parseRedisConnection(this.configService);
    const CONNECT_TIMEOUT = 3_000;
    const socketOptions = {
      ...buildNodeRedisSocketOptions(config, CONNECT_TIMEOUT),
      reconnectStrategy: () => false as const, // Don't retry - fail fast
    };

    try {
      this.publisher = createClient({
        socket: socketOptions,
        url: config.url,
      });
      this.publisher.on('error', (err) =>
        this.logger.error('Redis Publisher Error', err, this.context),
      );
      await Promise.race([
        this.publisher.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis publisher connection timeout')),
            CONNECT_TIMEOUT,
          ),
        ),
      ]);

      this.subscriber = createClient({
        socket: socketOptions,
        url: config.url,
      });
      this.subscriber.on('error', (err) =>
        this.logger.error('Redis Subscriber Error', err, this.context),
      );
      await Promise.race([
        this.subscriber.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis subscriber connection timeout')),
            CONNECT_TIMEOUT,
          ),
        ),
      ]);

      this.logger.log('Redis clients connected successfully', this.context);
      if (config.tls) {
        this.logger.log('Redis TLS enabled', this.context);
      }
      this.isInitialized = true;

      for (const { channel, handler } of this.pendingSubscriptions) {
        await this.subscribeInternal(channel, handler);
      }
      this.pendingSubscriptions = [];
    } catch (error) {
      this.logger.warn(
        `Redis connection failed - features disabled: ${(error as Error).message}`,
        this.context,
      );
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.publisher?.quit(), this.subscriber?.quit()]);
    this.logger.log('Redis clients disconnected', this.context);
  }

  async publish(channel: string, message: unknown) {
    if (!this.isInitialized) {
      this.logger.warn(
        `Cannot publish to ${channel}: Redis not yet initialized`,
        this.context,
      );

      throw new Error('Redis service not initialized');
    }

    const payload = JSON.stringify(message);
    await this.publisher.publish(channel, payload);
    this.logger.debug(`Published to ${channel}: ${payload}`, this.context);
  }

  async subscribe(channel: string, handler?: (message: unknown) => void) {
    if (!this.isInitialized) {
      // Queue the subscription for later
      this.pendingSubscriptions.push({ channel, handler });
      this.logger.log(
        `Queued subscription to channel: ${channel} (Redis not yet initialized)`,
      );
      return;
    }
    await this.subscribeInternal(channel, handler);
  }

  private async subscribeInternal(
    channel: string,
    handler?: (message: unknown) => void,
  ) {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
      await this.subscriber.subscribe(channel, (message) => {
        const parsedMessage = JSON.parse(message);
        // Emit for EventEmitter listeners
        this.emit('message', channel, message);
        // Call specific handlers
        const handlers = this.handlers.get(channel) || [];
        for (const h of handlers) {
          h(parsedMessage);
        }
      });
      this.logger.log(`Subscribed to channel: ${channel}`, this.context);
    }
    if (handler) {
      this.handlers.get(channel)?.push(handler);
    }
  }

  async unsubscribe(channel: string) {
    await this.subscriber.unsubscribe(channel);
    this.handlers.delete(channel);
    this.logger.log(`Unsubscribed from channel: ${channel}`, this.context);
  }

  /**
   * Get the raw publisher client for direct Redis commands (sorted sets, etc.)
   * Returns null if Redis is not initialized.
   */
  getPublisher(): RedisClientType | null {
    if (!this.isInitialized) {
      return null;
    }
    return this.publisher;
  }
}
