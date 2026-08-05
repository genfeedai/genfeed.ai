import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { InProcessRedisService } from '@libs/redis/in-process-redis.service';
import { RedisService } from '@libs/redis/redis.service';
import { isInProcessRedis } from '@libs/redis/redis-driver';
import { type DynamicModule, Global, Module, type Type } from '@nestjs/common';

export interface RedisModuleOptions {
  /** The ConfigModule to import */
  configModule: Type<unknown>;
  /** The ConfigService class to use for the 'ConfigService' token */
  configService: Type<unknown>;
}

/**
 * Shared Redis module that can be configured with any app's ConfigModule.
 *
 * The concrete implementation behind the `RedisService` token is chosen by the
 * `REDIS_DRIVER` config key (#2382): the default `redis` driver connects to a
 * real broker exactly as before, while `in-process` serves pub/sub from memory
 * for single-process deployments (desktop). Consumers inject `RedisService`
 * either way and cannot observe the difference.
 *
 * @example
 * // In app.module.ts
 * import { RedisModule } from '@libs/redis/redis.module';
 * import { ConfigModule } from '@libs/config/config.module';
 * import { ConfigService } from '@libs/config/config.service';
 *
 * @Module({
 *   imports: [
 *     RedisModule.forRoot({
 *       configModule: ConfigModule,
 *       configService: ConfigService,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 */
@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    return {
      exports: [RedisService, 'ConfigService'],
      global: true,
      imports: [options.configModule, LoggerModule],
      module: RedisModule,
      providers: [
        {
          provide: 'ConfigService',
          useExisting: options.configService,
        },
        {
          inject: ['ConfigService', LoggerService],
          provide: RedisService,
          useFactory: (
            configService: {
              get: (key: string) => string | undefined;
            },
            logger: LoggerService,
          ): RedisService =>
            isInProcessRedis(configService)
              ? new InProcessRedisService(configService, logger)
              : new RedisService(configService, logger),
        },
      ],
    };
  }
}
