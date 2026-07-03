import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronStreaksModule } from '@workers/crons/streaks/cron.streaks.module';
import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';
import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';
import { SystemSweepSchedulerService } from '@workers/scheduling/system-sweep-scheduler.service';
import { SYSTEM_SWEEPS_QUEUE } from '@workers/scheduling/system-sweeps.constants';
import { SystemSweepsProcessor } from '@workers/scheduling/system-sweeps.processor';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 50,
      },
      name: SYSTEM_SWEEPS_QUEUE,
    }),
    CronPostsModule,
    CronStreaksModule,
    CronTiktokModule,
    CronYoutubeModule,
  ],
  providers: [SystemSweepSchedulerService, SystemSweepsProcessor],
})
export class SystemSweepsModule {}
