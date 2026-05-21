import { PostsModule } from '@api/collections/posts/posts.module';
import { YoutubeUploadCompletionService } from '@api/services/integrations/youtube/services/modules/youtube-upload-completion.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [YoutubeUploadCompletionService],
  imports: [PostsModule],
  providers: [YoutubeUploadCompletionService],
})
export class YoutubeUploadCompletionModule {}
