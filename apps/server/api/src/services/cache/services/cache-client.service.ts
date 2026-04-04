import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class CacheClientService implements OnModuleInit, OnModuleDestroy {
  private readonly client: RedisClientType;
  private readonly constructorName = this.constructor.name;

  private static readonly MAX_RECONNECT_RETRIES = 10;
  private static readonly MAX_RECONNECT_DELAY_MS = 30_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const redisUrl =
      this.configService.get('REDIS_URL') || 'redis://localhost:6379';

    this.client = createClient({
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries: number) => {
          if (retries >= CacheClientService.MAX_RECONNECT_RETRIES) {
            this.logger.error(
              `${this.constructorName} max reconnect attempts reached (${retries}), giving up`,
            );
            return false;
          }
          const delay = Math.min(
            100 * 2 ** retries,
            CacheClientService.MAX_RECONNECT_DELAY_MS,
          );
          this.logger.warn(
            `${this.constructorName} reconnecting in ${delay}ms (attempt ${retries + 1}/${CacheClientService.MAX_RECONNECT_RETRIES})`,
          );
          return delay;
        },
      },
      url: redisUrl,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`${this.constructorName} Redis client error`, error);
    });

    this.client.on('connect', () => {
      this.logger.log(`${this.constructorName} Redis client connected`);
    });

    this.client.on('ready', () => {
      this.logger.log(`${this.constructorName} Redis client ready`);
    });
  }

  get isReady(): boolean {
    return this.client.isReady;
  }

  get instance(): RedisClientType {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    const CONNECT_TIMEOUT = 3_000;
    try {
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis connection timeout')),
            CONNECT_TIMEOUT,
          ),
        ),
      ]);
      this.logger.log(`${this.constructorName} initialized successfully`);
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to connect - cache disabled`,
        error,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      // Remove all event listeners to prevent memory leaks
      this.client.removeAllListeners();
      await this.client.quit();
      this.logger.log(`${this.constructorName} disconnected`);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} disconnect error`, error);
    }
  }
}
