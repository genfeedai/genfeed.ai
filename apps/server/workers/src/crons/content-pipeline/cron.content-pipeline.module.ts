import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronContentPipelineService } from '@workers/crons/content-pipeline/cron.content-pipeline.service';

@Module({
  exports: [CronContentPipelineService],
  imports: [forwardRef(() => ContentOrchestrationModule)],
  providers: [CronContentPipelineService],
})
export class CronContentPipelineModule {}
