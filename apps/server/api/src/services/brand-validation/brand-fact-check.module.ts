import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { BrandFactCheckService } from '@api/services/brand-validation/brand-fact-check.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** Brand fact check (#6717): claims judged against approved Brand OS facts and Knowledge only. */
@Module({
  exports: [BrandFactCheckService],
  imports: [ContextsModule, LlmDispatcherModule, LoggerModule],
  providers: [BrandFactCheckService],
})
export class BrandFactCheckModule {}
