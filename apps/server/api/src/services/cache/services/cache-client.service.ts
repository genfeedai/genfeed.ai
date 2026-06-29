import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { parseRedisConnection } from '@libs/redis/redis-connection.utils';
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
  private static readonly DISCONNECT_TIMEOUT_MS = 3_000;
  private static readonly FORCE_DISCONNECT_TIMEOUT_MS = 500;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const config = parseRedisConnection(this.configService);

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
        ...(config.tls && { tls: true }),
      },
      url: config.url,
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
      await this.withTimeout(
        this.client.quit(),
        CacheClientService.DISCONNECT_TIMEOUT_MS,
        'Redis disconnect timeout',
      );
      this.logger.log(`${this.constructorName} disconnected`);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} disconnect error`, error);
      await this.forceCloseClient();
    }
  }

  private async forceCloseClient(): Promise<void> {
    const client = this.client as RedisClientType & {
      destroy?: () => void;
      disconnect?: () => Promise<void> | void;
    };

    try {
      if (typeof client.destroy === 'function') {
        client.destroy();
        return;
      }

      if (typeof client.disconnect === 'function') {
        await this.withTimeout(
          Promise.resolve(client.disconnect()),
          CacheClientService.FORCE_DISCONNECT_TIMEOUT_MS,
          'Redis force disconnect timeout',
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} force disconnect error`,
        error,
      );
    }
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(timeoutMessage)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
