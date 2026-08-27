import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [WorkflowDeploymentBackfillService],
})
export class WorkflowBackfillModule {}
