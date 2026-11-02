import { ContentPreviewsService } from '@api/collections/content-previews/services/content-previews.service';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentPreviewsService],
  imports: [MediaUrlsModule],
  providers: [ContentPreviewsService],
})
export class ContentPreviewsModule {}
