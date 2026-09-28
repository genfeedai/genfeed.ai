import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule, LoggerModule, NotificationsModule, FeatureFlagModule],
  providers: [SystemEventsService],
  exports: [SystemEventsService],
})
export class SystemEventsModule {}
