import { ModelsModule } from '@api/collections/models/models.module';
import {
  Workflow,
  WorkflowSchema,
} from '@api/collections/workflows/schemas/workflow.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';

@Module({
  imports: [
    forwardRef(() => ModelsModule),
    MongooseModule.forFeature(
      [{ name: Workflow.name, schema: WorkflowSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CronModelDeprecationService],
})
export class CronModelDeprecationModule {}
