import { AdDialogueVerificationListener } from '@api/services/ad-dialogue-verification/ad-dialogue-verification.listener';
import { AdDialogueVerificationService } from '@api/services/ad-dialogue-verification/ad-dialogue-verification.service';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Events are process-local and renders settle in both the API and the workers,
 * so every process imports this module; it is the only place the listener is
 * provided, so each process subscribes once.
 */
@Module({
  imports: [LoggerModule, MediaVendorCostModule, WhisperModule],
  providers: [AdDialogueVerificationListener, AdDialogueVerificationService],
})
export class AdDialogueVerificationModule {}
