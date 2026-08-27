import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { WorkersDomainModule } from '@server/workers-domain.module';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';

@Module({
  exports: [CronEngagementTriggersService],
  imports: [PrismaModule, WorkersDomainModule],
  providers: [CronEngagementTriggersService],
})
export class CronEngagementModule {}
