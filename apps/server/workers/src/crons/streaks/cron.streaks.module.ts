import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { Module } from '@nestjs/common';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';

@Module({
  imports: [StreaksModule],
  exports: [CronStreaksService],
  providers: [CronStreaksService, SystemWorkflowProvenanceService],
})
export class CronStreaksModule {}
