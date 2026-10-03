import { LoggerModule } from '@libs/logger/logger.module';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@notifications/config/config.module';
import { NotificationRuntimeSettingsService } from '@notifications/services/runtime-settings/notification-runtime-settings.service';

@Global()
@Module({
  exports: [ConfigModule, LoggerModule, NotificationRuntimeSettingsService],
  imports: [ConfigModule, LoggerModule],
  providers: [NotificationRuntimeSettingsService],
})
export class SharedModule {}
