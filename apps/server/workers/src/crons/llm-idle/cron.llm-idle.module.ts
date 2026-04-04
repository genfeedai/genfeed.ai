import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CronLlmIdleService } from '@workers/crons/llm-idle/cron.llm-idle.service';

@Module({
  imports: [LoggerModule],
  providers: [CronLlmIdleService],
})
export class CronLlmIdleModule {}
