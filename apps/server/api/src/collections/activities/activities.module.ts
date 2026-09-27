/**
 * Activities Module
 * Activity history: reads, read state and the recording API that writes
 * activities and raises their alerts (#5197).
 */
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MembersModule } from '@api/collections/members/members.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ActivitiesController],
  exports: [ActivitiesService, ActivityRecordingModule],
  // StreaksModule registers the listener that advances streaks when a
  // qualifying activity is recorded.
  imports: [ActivityRecordingModule, MembersModule, StreaksModule],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
