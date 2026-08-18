import { Module } from '@nestjs/common';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';

@Module({
  exports: [CronTranscriptPurgeService],
  providers: [CronTranscriptPurgeService],
})
export class CronTranscriptPurgeModule {}
