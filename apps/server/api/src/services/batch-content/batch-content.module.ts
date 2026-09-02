import { BrandsModule } from '@api/collections/brands/brands.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { BatchContentController } from '@api/services/batch-content/batch-content.controller';
import { BatchContentService } from '@api/services/batch-content/batch-content.service';
import { SkillWorkflowModule } from '@api/services/skill-executor/skill-executor.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BatchContentController],
  exports: [BatchContentService],
  imports: [BrandsModule, LoggerModule, SkillWorkflowModule, WorkflowsModule],
  providers: [BatchContentService],
})
export class BatchContentModule {}
