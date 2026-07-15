import { PostsModule } from '@api/collections/posts/posts.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { forwardRef, Module } from '@nestjs/common';
import { SchedulerPublishStateService } from '@workers/crons/posts/scheduler-publish-state.service';
import { CronYoutubeAnalyticsService } from '@workers/crons/youtube/cron.youtube-analytics.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => PostsModule),
    forwardRef(() => WebhookClientModule),
    forwardRef(() => SocialInboxModule),
    forwardRef(() => WorkersQueuesModule),
    forwardRef(() => YoutubeModule),
    PrismaModule,
  ],
  exports: [CronYoutubeStatusService],
  providers: [
    CronYoutubeAnalyticsService,
    CronYoutubeMessagesService,
    CronYoutubeStatusService,
    SchedulerPublishStateService,
    SystemWorkflowProvenanceService,
  ],
})
export class CronYoutubeModule {}
