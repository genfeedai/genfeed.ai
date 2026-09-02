/**
 * Activities Module
 * Activity logging: user actions, audit trails, activity feeds,
and analytics tracking.
 */
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MembersModule } from '@api/collections/members/members.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { SERVER_TOKENS } from '@api/index';
import { Module } from '@nestjs/common';

const SERVER_ACTIVITY_WRITER_PROVIDER = {
  provide: SERVER_TOKENS.activities,
  useExisting: ActivitiesService,
};

@Module({
  controllers: [ActivitiesController],
  exports: [ActivitiesService, SERVER_ACTIVITY_WRITER_PROVIDER],
  imports: [MembersModule, StreaksModule],
  providers: [ActivitiesService, SERVER_ACTIVITY_WRITER_PROVIDER],
})
export class ActivitiesModule {}
