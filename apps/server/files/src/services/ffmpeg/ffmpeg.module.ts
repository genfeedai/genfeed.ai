import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import {
  FFmpegBeatDetectionService,
  FFmpegBeatSyncService,
  FFmpegCoreService,
  FFmpegEffectsService,
  FFmpegMergeService,
  FFmpegService,
  FFmpegTransformService,
} from '@files/services/ffmpeg/services';
import { SharedModule } from '@files/shared/shared.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    BinaryValidationService,
    FFmpegBeatDetectionService,
    FFmpegBeatSyncService,
    FFmpegService,
  ],
  imports: [SharedModule],
  providers: [
    BinaryValidationService,
    FFmpegBeatDetectionService,
    FFmpegBeatSyncService,
    FFmpegCoreService,
    FFmpegEffectsService,
    FFmpegMergeService,
    FFmpegService,
    FFmpegTransformService,
  ],
})
export class FFmpegModule {}
