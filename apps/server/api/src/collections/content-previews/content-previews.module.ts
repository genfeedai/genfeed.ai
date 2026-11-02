import { ContentPreviewsService } from '@api/collections/content-previews/services/content-previews.service';
import { MembersModule } from '@api/collections/members/members.module';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentPreviewsService],
  imports: [MediaUrlsModule, MembersModule],
  providers: [ContentPreviewsService],
})
export class ContentPreviewsModule {}
