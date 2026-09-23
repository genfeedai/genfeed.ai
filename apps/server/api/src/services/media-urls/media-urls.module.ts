import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [MediaUrlService],
  providers: [MediaUrlService],
})
export class MediaUrlsModule {}
