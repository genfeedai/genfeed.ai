import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';

@Module({
  imports: [PrismaModule, StreaksModule, WorkflowsModule],
  exports: [CronStreaksService],
  providers: [CronStreaksService],
})
export class CronStreaksModule {}
