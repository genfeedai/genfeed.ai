import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [FailedGenerationService],
  imports: [forwardRef(() => ActivitiesModule), NotificationsPublisherModule],
  providers: [FailedGenerationService],
})
export class FailedGenerationModule {}
