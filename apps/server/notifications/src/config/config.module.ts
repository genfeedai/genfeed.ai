import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { ValidationConfigService } from '@notifications/config/services/validation.config';

@Global()
@Module({
  exports: [ConfigService, ValidationConfigService],
  providers: [
    ValidationConfigService,
    {
      provide: ConfigService,
      useValue: new ConfigService(),
    },
  ],
})
export class ConfigModule {}
