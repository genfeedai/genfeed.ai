import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import { PatternExtractionWorkflowService } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction-workflow.service';

@Module({
  exports: [CronPatternExtractionService],
  imports: [
    CreativePatternsModule,
    LoggerModule,
    PrismaModule,
    WorkflowsModule,
  ],
  providers: [CronPatternExtractionService, PatternExtractionWorkflowService],
})
export class CronPatternExtractionModule {}
