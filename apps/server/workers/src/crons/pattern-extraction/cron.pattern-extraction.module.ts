import { forwardRef, Module } from '@nestjs/common';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [forwardRef(() => WorkersQueuesModule)],
  providers: [CronPatternExtractionService],
})
export class CronPatternExtractionModule {}
