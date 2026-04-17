/**
 * Activities Module
 * Activity logging: user actions, audit trails, activity feeds,
and analytics tracking.
 */
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MembersModule } from '@api/collections/members/members.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ActivitiesController],
  exports: [ActivitiesService],
  imports: [MembersModule, forwardRef(() => StreaksModule)],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
