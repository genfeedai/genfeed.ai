import { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import { Module } from '@nestjs/common';

@Module({
  exports: [TempFileCleanupCron],
  providers: [TempFileCleanupCron],
})
export class CronModule {}
