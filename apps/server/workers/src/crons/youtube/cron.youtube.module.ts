import { PostsModule } from '@api/collections/posts/posts.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronYoutubeAnalyticsService } from '@workers/crons/youtube/cron.youtube-analytics.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => PostsModule),
    forwardRef(() => SocialInboxModule),
    forwardRef(() => WorkersQueuesModule),
    forwardRef(() => YoutubeModule),
  ],
  providers: [
    CronYoutubeAnalyticsService,
    CronYoutubeMessagesService,
    CronYoutubeStatusService,
  ],
})
export class CronYoutubeModule {}
