import { PostsModule } from '@api/collections/posts/posts.module';
import { YoutubeUploadCompletionService } from '@api/services/integrations/youtube/services/modules/youtube-upload-completion.service';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [YoutubeUploadCompletionService],
  imports: [PostsModule, WebhookClientModule],
  providers: [YoutubeUploadCompletionService],
})
export class YoutubeUploadCompletionModule {}
