import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';

/**
 * Provides generation-provider integration services extracted to
 * `@genfeedai/server` (#1090) to the workers runtime, so processors and cron
 * tasks no longer deep-import them from API source. Extend this list as
 * further generation providers (replicate, fal, …) move to the server tier.
 */
const GENERATION_SERVICES = [LeonardoAIService] as const;

@Module({
  exports: [...GENERATION_SERVICES],
  imports: [ConfigModule, LoggerModule],
  providers: [...GENERATION_SERVICES],
})
export class GenerationServicesModule {}
