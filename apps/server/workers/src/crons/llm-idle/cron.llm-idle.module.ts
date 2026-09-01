import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CronLlmIdleService } from '@workers/crons/llm-idle/cron.llm-idle.service';

@Module({
  exports: [CronLlmIdleService],
  imports: [LoggerModule],
  providers: [CronLlmIdleService],
})
export class CronLlmIdleModule {}
