import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { SystemWorkflowProvenanceService } from '@server/collections/workflows/system-workflow-provenance.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [PrismaModule, WorkersDomainModule],
  exports: [CronStreaksService],
  providers: [CronStreaksService, SystemWorkflowProvenanceService],
})
export class CronStreaksModule {}
