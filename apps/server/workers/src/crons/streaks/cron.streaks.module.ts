import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { SystemWorkflowProvenanceService } from '@server/collections/workflows/system-workflow-provenance.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';

@Module({
  imports: [PrismaModule, StreaksModule],
  exports: [CronStreaksService],
  providers: [CronStreaksService, SystemWorkflowProvenanceService],
})
export class CronStreaksModule {}
