import { PostsModule } from '@api/collections/posts/posts.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronYoutubeAnalyticsService } from '@workers/crons/youtube/cron.youtube-analytics.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => PostsModule),
    forwardRef(() => WorkersQueuesModule),
    forwardRef(() => YoutubeModule),
  ],
  providers: [CronYoutubeAnalyticsService, CronYoutubeStatusService],
})
export class CronYoutubeModule {}
