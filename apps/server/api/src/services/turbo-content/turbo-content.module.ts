import { BrandsModule } from '@api/collections/brands/brands.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { SkillWorkflowModule } from '@api/services/skill-executor/skill-executor.module';
import { TurboContentController } from '@api/services/turbo-content/turbo-content.controller';
import { TurboContentService } from '@api/services/turbo-content/turbo-content.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TurboContentController],
  exports: [TurboContentService],
  imports: [BrandsModule, LoggerModule, SkillWorkflowModule, WorkflowsModule],
  providers: [TurboContentService],
})
export class TurboContentModule {}
