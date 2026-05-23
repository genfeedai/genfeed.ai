/**
 * Captions Module
 * Video captions & subtitles: AI-generated captions, multi-language support,
SRT/VTT export, and automated caption timing.
 */

import { CaptionsController } from '@api/collections/captions/controllers/captions.controller';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [CaptionsController],
  exports: [CaptionsService],
  imports: [
    forwardRef(() => IngredientsModule),
    forwardRef(() => WhisperModule),
  ],
  providers: [CaptionsService],
})
export class CaptionsModule {}
