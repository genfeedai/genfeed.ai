import { BatchProjectsController } from '@api/collections/batch-projects/controllers/batch-projects.controller';
import { BatchProjectReconcileService } from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import { BatchProjectsService } from '@api/collections/batch-projects/services/batch-projects.service';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BatchProjectsController],
  exports: [BatchProjectReconcileService],
  imports: [
    BatchGenerationModule,
    LoggerModule,
    PostsCoreModule,
    WorkflowsCoreModule,
    WorkflowsModule,
  ],
  providers: [BatchProjectReconcileService, BatchProjectsService],
})
export class BatchProjectsModule {}
