import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule, ConfigModule, LoggerModule, NotificationsModule],
  providers: [SystemEventsService],
  exports: [SystemEventsService],
})
export class SystemEventsModule {}
