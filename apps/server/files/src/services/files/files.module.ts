import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { FilesPortraitBlurService } from '@files/services/files/blur/files-portrait-blur.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesGifService } from '@files/services/files/gif/files-gif.service';
import { FilesImageToVideoService } from '@files/services/files/image-to-video/files-image-to-video.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import { FilesSplitScreenService } from '@files/services/files/split/files-split-screen.service';
import { ImagesSplitService } from '@files/services/images/images-split.service';
import { SharedModule } from '@files/shared/shared.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    FilesCaptionsService,
    FilesGifService,
    FilesImageToVideoService,
    FilesKenBurnsEffectService,
    FilesPortraitBlurService,
    FilesService,
    FilesSplitScreenService,
    ImagesSplitService,
  ],
  imports: [SharedModule, FFmpegModule],
  providers: [
    FilesCaptionsService,
    FilesGifService,
    FilesImageToVideoService,
    FilesKenBurnsEffectService,
    FilesPortraitBlurService,
    FilesService,
    FilesSplitScreenService,
    ImagesSplitService,
  ],
})
export class FilesModule {}
