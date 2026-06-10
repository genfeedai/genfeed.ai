import { LoggerModule } from '@libs/logger/logger.module';
import { S3Service } from '@libs/s3/s3.service';
import { type DynamicModule, Global, Module, type Type } from '@nestjs/common';

export interface S3ModuleOptions {
  /** The ConfigModule to import */
  configModule: Type<unknown>;
  /** The ConfigService class to register under the 'ConfigService' token */
  configService: Type<unknown>;
}

/**
 * Shared S3 module that can be configured with any app's ConfigModule.
 *
 * The app's ConfigService must expose:
 *   - AWS_ACCESS_KEY_ID: string
 *   - AWS_SECRET_ACCESS_KEY: string
 *   - AWS_REGION: string
 *
 * @example
 * // In app.module.ts
 * import { S3Module } from '@libs/s3/s3.module';
 * import { ConfigModule } from '@images/config/config.module';
 * import { ConfigService } from '@images/config/config.service';
 *
 * @Module({
 *   imports: [
 *     S3Module.forRoot({ configModule: ConfigModule, configService: ConfigService }),
 *   ],
 * })
 * export class AppModule {}
 */
@Global()
@Module({})
export class S3Module {
  static forRoot(options: S3ModuleOptions): DynamicModule {
    return {
      exports: [S3Service],
      global: true,
      imports: [options.configModule, LoggerModule],
      module: S3Module,
      providers: [
        S3Service,
        {
          provide: 'ConfigService',
          useExisting: options.configService,
        },
      ],
    };
  }
}
