import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { CollaborationAlertsService } from '@api/services/collaboration-alerts/collaboration-alerts.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** Bell and email alerts for review requests, review decisions and mentions. */
@Module({
  exports: [CollaborationAlertsService],
  imports: [ActivityRecordingModule, LoggerModule, PrismaModule],
  providers: [CollaborationAlertsService],
})
export class CollaborationAlertsModule {}
