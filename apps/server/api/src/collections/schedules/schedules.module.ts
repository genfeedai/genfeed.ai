import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
/**
 * Schedules Module
 * Learned posting windows and channel capabilities. Releases are scheduled
 * through post-groups.
 */

import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SchedulesController],
  exports: [SchedulesService],
  imports: [PlatformSettingsModule, ConfigModule],
  providers: [SchedulesService],
})
export class SchedulesModule {}
