import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildIoRedisClientOptions,
  parseRedisConnectionForWorkload,
  type RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Base lifecycle for a single isolated-workload ioredis client (#1186).
 *
 * Each subclass binds one {@link RedisWorkload} (cache, rate-limit, …) so its
 * client resolves an independent connection (distinct logical DB by default, or
 * a dedicated instance via `REDIS_<WORKLOAD>_URL`). A failure on one workload's
 * client — reconnect storms, an outage — is contained to that client and cannot
 * cascade into the others, because they no longer share a connection.
 *
 * Provides resilient exponential-backoff reconnect, readiness tracking (so
 * fail-open callers can cheaply gate on `isReady`), and graceful teardown with a
 * force-close fallback if `quit()` hangs.
 */
export abstract class WorkloadRedisClientService
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly client: Redis;
  private readonly constructorName = this.constructor.name;

  private static readonly MAX_RECONNECT_RETRIES = 10;
  private static readonly MAX_RECONNECT_DELAY_MS = 30_000;
  private static readonly DISCONNECT_TIMEOUT_MS = 3_000;
  private static readonly FORCE_DISCONNECT_TIMEOUT_MS = 500;

  protected constructor(
    configService: ConfigService,
    private readonly logger: LoggerService,
    workload: RedisWorkload,
  ) {
    const config = parseRedisConnectionForWorkload(configService, workload);

    this.client = new Redis(
      buildIoRedisClientOptions(config, {
        connectTimeout: 3_000,
        retryStrategy: (retries: number) => {
          if (retries >= WorkloadRedisClientService.MAX_RECONNECT_RETRIES) {
            this.logger.error(
              `${this.constructorName} max reconnect attempts reached (${retries}), giving up`,
            );
            return null;
          }
          const delay = Math.min(
            100 * 2 ** retries,
            WorkloadRedisClientService.MAX_RECONNECT_DELAY_MS,
          );
          this.logger.warn(
            `${this.constructorName} reconnecting in ${delay}ms (attempt ${retries + 1}/${WorkloadRedisClientService.MAX_RECONNECT_RETRIES})`,
          );
          return delay;
        },
      }),
    );

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
    return this.client.status === 'ready';
  }

  get instance(): Redis {
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
        `${this.constructorName} failed to connect - client disabled`,
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
        WorkloadRedisClientService.DISCONNECT_TIMEOUT_MS,
        'Redis disconnect timeout',
      );
      this.logger.log(`${this.constructorName} disconnected`);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} disconnect error`, error);
      await this.forceCloseClient();
    }
  }

  private async forceCloseClient(): Promise<void> {
    try {
      await this.withTimeout(
        Promise.resolve(this.client.disconnect()),
        WorkloadRedisClientService.FORCE_DISCONNECT_TIMEOUT_MS,
        'Redis force disconnect timeout',
      );
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
