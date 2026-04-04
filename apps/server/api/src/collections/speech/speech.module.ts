import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { SpeechController } from '@api/collections/speech/controllers/speech.controller';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

/**
 * Speech Module
 * Handles speech-to-text transcription with credit deduction
 */
@Module({
  controllers: [SpeechController],
  exports: [],
  imports: [
    ByokModule,
    CreditsModule,
    forwardRef(() => ModelsModule),
    ReplicateModule,
  ],
  providers: [CreditsGuard, CreditsInterceptor],
})
export class SpeechModule {}
