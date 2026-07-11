import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { PollUntilService } from '@server/shared/services/poll-until/poll-until.service';
import { FileServicesModule } from '@workers/services/file-services.module';

/**
 * Provides generation-provider integration services extracted to
 * `@genfeedai/server` (#1090) to the workers runtime, so processors and cron
 * tasks no longer deep-import them from API source. Extend this list as
 * further generation providers move to the server tier.
 */
const GENERATION_SERVICES = [
  ElevenLabsService,
  FalService,
  KlingAIService,
  LeonardoAIService,
  ReplicateService,
] as const;

@Module({
  exports: [...GENERATION_SERVICES],
  imports: [ConfigModule, FileServicesModule, HttpModule, LoggerModule],
  providers: [...GENERATION_SERVICES, PollUntilService],
})
export class GenerationServicesModule {}
