import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { FacebookLiveController } from '@api/services/integrations/facebook/controllers/facebook-live.controller';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { FacebookLivePostService } from '@api/services/integrations/facebook/services/facebook-live-post.service';
import { FacebookLiveVideoService } from '@api/services/integrations/facebook/services/facebook-live-video.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

/**
 * Facebook live video. Apart from FacebookModule because it persists posts,
 * and PostsModule already reaches FacebookModule through analytics collection.
 */
@Module({
  controllers: [FacebookLiveController],
  imports: [
    CredentialsCoreModule,
    FacebookModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    PostsCoreModule,
  ],
  providers: [FacebookLivePostService, FacebookLiveVideoService],
})
export class FacebookLiveModule {}
