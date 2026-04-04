import { CronJobsModule } from '@api/collections/cron-jobs/cron-jobs.module';
import { Module } from '@nestjs/common';

import { CronDynamicJobsService } from '@workers/crons/dynamic-jobs/cron.dynamic-jobs.service';

@Module({
  exports: [CronDynamicJobsService],
  imports: [CronJobsModule],
  providers: [CronDynamicJobsService],
})
export class CronDynamicJobsModule {}
