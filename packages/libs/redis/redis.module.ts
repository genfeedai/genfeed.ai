import { LoggerModule } from '@libs/logger/logger.module';
import { RedisService } from '@libs/redis/redis.service';
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
 * @example
 * // In app.module.ts
 * import { RedisModule } from '@libs/redis/redis.module';
 * import { ConfigModule } from '@api/config/config.module';
 * import { ConfigService } from '@api/config/config.service';
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
        RedisService,
        {
          provide: 'ConfigService',
          useExisting: options.configService,
        },
      ],
    };
  }
}
