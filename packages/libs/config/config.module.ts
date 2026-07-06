/**
 * Config Module
 * Environment configuration management: load .env variables, validate config,
 * provide typed configuration access across the application.
 */

import { ConfigService } from '@libs/config/config.service';
import { ValidationConfigService } from '@libs/config/services/validation.config';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [ConfigService, ValidationConfigService],
  providers: [
    ValidationConfigService,
    {
      provide: ConfigService,
      useFactory: () => new ConfigService(),
    },
  ],
})
export class ConfigModule {}
