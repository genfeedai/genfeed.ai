import { LoggerModule } from '@libs/logger/logger.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { CronAgentTurnReconcileService } from '@workers/crons/agent-turn/cron.agent-turn-reconcile.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  exports: [CronAgentTurnReconcileService],
  imports: [
    LoggerModule,
    PrismaModule,
    WorkersQueuesModule,
  ],
  providers: [CronAgentTurnReconcileService],
})
export class CronAgentTurnModule {}
